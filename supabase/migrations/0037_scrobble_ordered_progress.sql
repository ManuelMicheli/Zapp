-- Invii ritentati/fuori ordine non devono far arretrare sessione o punto salvato.
-- Nessuna tabella o policy nuova: stessa firma di scrobble_apply.
create or replace function public.scrobble_apply(p_token_hash text, p_intent jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device       public.devices%rowtype;
  v_user_id      uuid;
  v_membri       int;
  v_session_id   uuid;
  v_title_id     bigint  := (p_intent ->> 'title_id')::bigint;
  v_media_type   public.media_type := (p_intent ->> 'media_type')::public.media_type;
  v_provider     int     := (p_intent ->> 'provider_id')::int;
  v_season       int     := nullif(p_intent ->> 'season', '')::int;
  v_episode      int     := nullif(p_intent ->> 'episode', '')::int;
  v_state        text    := p_intent ->> 'state';
  -- senza coalesce, un intento senza 'position_ms' farebbe fallire l'insert/update
  -- di watch_sessions.position_ms, che e' NOT NULL: un payload incompleto deve
  -- degradare a 0, non far cadere l'intera chiamata.
  v_position     bigint  := coalesce((p_intent ->> 'position_ms')::bigint, 0);
  v_duration     bigint  := nullif(p_intent ->> 'duration_ms', '')::bigint;
  v_completed    boolean := coalesce((p_intent ->> 'completed')::boolean, false);
  v_at           timestamptz := coalesce((p_intent ->> 'at')::timestamptz, now());
  v_progress     jsonb   := p_intent -> 'progress';
  v_entry        public.watch_entries%rowtype;
  v_written      boolean := false;
  v_rows         int;
begin
  select * into v_device from public.devices
   where token_hash = p_token_hash and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_device');
  end if;

  update public.devices set last_seen_at = now() where id = v_device.id;

  -- `min(user_id)` non esiste: Postgres non definisce min() su uuid, e la
  -- funzione sollevava 42883 a **ogni** chiamata (errore 0035, trovato solo
  -- provandola dal vivo il 2026-09-09 — l'eccezione fa rollback di tutto,
  -- compreso l'update di last_seen_at tre righe sopra, quindi da fuori
  -- sembrava che gli eventi non arrivassero mai). Il valore serve solo quando
  -- i membri attivi sono esattamente uno, quindi va bene un elemento qualsiasi
  -- dell'aggregato.
  select count(*), (array_agg(user_id))[1] into v_membri, v_user_id
    from public.device_members
   where device_id = v_device.id
     and (paused_until is null or paused_until < now());

  -- Serializza gli eventi del dispositivo, anche fra richieste/lambda diverse.
  perform pg_advisory_xact_lock(hashtextextended(v_device.id::text, 0));
  if exists (select 1 from public.watch_sessions
             where device_id = v_device.id and last_heartbeat_at > v_at) then
    return jsonb_build_object('ok', true, 'entry_written', false);
  end if;

  -- chiude le sessioni orfane di questo dispositivo
  update public.watch_sessions
     set ended_at = now(), state = 'stopped'
   where device_id = v_device.id
     and ended_at is null
     and last_heartbeat_at < now() - interval '4 hours';

  -- una sessione per (dispositivo, titolo, stagione, episodio)
  select id into v_session_id from public.watch_sessions
   where device_id = v_device.id
     and title_id = v_title_id and media_type = v_media_type
     and season_number is not distinct from v_season
     and episode_number is not distinct from v_episode
     and ended_at is null
   order by last_heartbeat_at desc
   limit 1;

  if v_session_id is null then
    -- un titolo diverso chiude quello di prima
    update public.watch_sessions set ended_at = now(), state = 'stopped'
     where device_id = v_device.id and ended_at is null;

    insert into public.watch_sessions
      (device_id, user_id, provider_id, title_id, media_type, season_number,
       episode_number, state, position_ms, duration_ms, completed, last_heartbeat_at)
    values
      (v_device.id, case when v_membri = 1 then v_user_id else null end, v_provider,
       v_title_id, v_media_type, v_season, v_episode, v_state, v_position, v_duration,
       v_completed, v_at)
    returning id into v_session_id;
  else
    update public.watch_sessions
       set state = v_state,
           position_ms = v_position,
           duration_ms = coalesce(v_duration, duration_ms),
           completed = watch_sessions.completed or v_completed,
           last_heartbeat_at = v_at,
           ended_at = case when v_state = 'stopped' then now() else null end
     where id = v_session_id;
  end if;

  if v_state = 'stopped' then
    update public.watch_sessions set ended_at = coalesce(ended_at, v_at)
    where id = v_session_id;
  end if;

  -- Finche' l'utente non e' certo, la libreria non si tocca.
  if v_membri <> 1 then
    return jsonb_build_object('ok', true, 'user_id', null, 'session_id', v_session_id,
                              'entry_written', false);
  end if;

  -- Due dispositivi dello stesso utente non possono cancellarsi il punto recente.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_title_id::text || ':' || v_media_type::text, 1));
  select * into v_entry from public.watch_entries
   where user_id = v_user_id and title_id = v_title_id and media_type = v_media_type;

  if not found then
    insert into public.watch_entries
      (user_id, title_id, media_type, status, started_at, last_watched_at)
    values (v_user_id, v_title_id, v_media_type, 'watching', now(), v_at)
    returning * into v_entry;
    v_written := true;
  elsif v_entry.position_at is not null and v_entry.position_at > v_at then
    return jsonb_build_object('ok', true, 'entry_written', false);
  elsif v_entry.status in ('want', 'dropped') then
    update public.watch_entries
       set status = 'watching',
           started_at = coalesce(started_at, now()),
           last_watched_at = greatest(last_watched_at, v_at)
     where id = v_entry.id
    returning * into v_entry;
    v_written := true;
  end if;

  if v_completed then
    -- L'"ultimo finito" avanza per stagione, non per numero di episodio nudo:
    -- confrontare l'episodio di una stagione nuova con quello della stagione
    -- vecchia (col vecchio greatest) dichiarava viste puntate mai viste (S2E1
    -- dopo S1E10 diventava "fino a S2E10"). `season_number` nullo NON e' un
    -- valore noto da proteggere: e' "non lo sappiamo ancora", diverso dal
    -- "sappiamo che e' indietro" che il resto di questo case evita. Se
    -- abbiamo appena visto l'utente finire v_season/v_episode, scriverli e'
    -- piu' vero che lasciare null per sempre — senza questo caso una serie
    -- mai tracciata prima (season_number null dall'insert poco sopra)
    -- restava con season/episode null a ogni episodio completato, per
    -- sempre. Vale anche per una entry preesistente senza stagione (es. una
    -- serie segnata vista a mano): da quel momento in poi lo scrobble reale
    -- e' l'unico dato che abbiamo, quindi diventa quello vero.
    update public.watch_entries
       set season_number = case
             when v_media_type = 'tv'
                  and season_number is null and v_season is not null
               then v_season
             when v_media_type = 'tv'
                  and season_number is not null and v_season is not null
                  and v_season > season_number
               then v_season
             else season_number end,
           episode_number = case
             when v_media_type = 'tv'
                  and season_number is null and v_season is not null
               then v_episode
             when v_media_type = 'tv'
                  and season_number is not null and v_season is not null
                  and v_season > season_number
               then v_episode
             when v_media_type = 'tv'
                  and season_number is not null and v_season is not null
                  and v_season = season_number
               then greatest(episode_number, v_episode)
             else episode_number end,
           status = case when v_media_type = 'movie' then 'watched' else status end,
           finished_at = case when v_media_type = 'movie' then now() else finished_at end,
           last_watched_at = greatest(last_watched_at, v_at),
           position_ms = null, position_duration_ms = null,
           position_season = null, position_episode = null, position_at = v_at
     where id = v_entry.id;
    v_written := true;
  elsif v_progress is not null and jsonb_typeof(v_progress) = 'object' then
    -- la guardia temporale puo' filtrare zero righe: senza GET DIAGNOSTICS,
    -- v_written direbbe "scritto" anche quando l'evento e' arrivato in
    -- ritardo e non ha toccato nulla.
    update public.watch_entries
       set position_ms = (v_progress ->> 'position_ms')::bigint,
           position_duration_ms = nullif(v_progress ->> 'duration_ms', '')::bigint,
           position_season = v_season,
           position_episode = v_episode,
           position_at = v_at,
           last_watched_at = greatest(last_watched_at, v_at)
     where id = v_entry.id
       and (position_at is null or position_at <= v_at);   -- mai indietro nel tempo
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_written := true;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'session_id', v_session_id,
                            'entry_written', v_written);
end;
$$;

-- La chiama solo il nostro server, col service role. Mai esposta come endpoint.
revoke all on function public.scrobble_apply(text, jsonb) from anon, authenticated, public;
