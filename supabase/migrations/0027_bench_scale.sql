-- Banco di prova per le misure di scala. Genera utenti e librerie finti, misura
-- le query vere di home/libreria/feed/notifiche, poi **cancella tutto quello che
-- ha inserito** prima di tornare. Gli id finti nascono tutti dal prefisso
-- 'beeeeeee-...', cosi' la pulizia e' esatta e non tocca dati veri.
--
-- Non e' codice di produzione: nessuna route la chiama, il grant e' solo per
-- service_role.
create or replace function public.bench_scale(
  n_utenti int default 500,
  n_entry_per_utente int default 1000,
  giri int default 5
)
returns jsonb
language plpgsql
volatile
-- **security invoker** di proposito: dentro una funzione security definer
-- Postgres vieta `set role` ("cannot set parameter role within security-definer
-- function"), e senza cambiare ruolo non si misura la RLS, che e' proprio
-- l'oggetto della prova. Chi la chiama e' il service client, cioe' gia'
-- `postgres`: il grant sotto tiene fuori tutti gli altri.
security invoker
set search_path = public
as $fn$
declare
  ids uuid[];
  soggetto uuid;
  esiti jsonb := '[]'::jsonb;
  piano jsonb;
  sql_text text;
  nome text;
  minimo numeric;
  ms numeric;
  piano_migliore jsonb;
  -- `giro` e non `g`: `g` e' gia' l'alias di generate_series negli inserimenti,
  -- e Postgres rifiuta il riferimento ambiguo.
  giro int;
  coppie text[][] := array[
    ['libreria', $q$select w.id, w.status, t.title from watch_entries w
        join titles t on t.id = w.title_id and t.media_type = w.media_type
        where w.user_id = %L and w.status = 'watching'
        order by w.last_watched_at desc limit 60$q$],
    ['feed', $q$select a.id from activities a
        where a.created_at > now() - interval '30 days'
        order by a.created_at desc limit 40$q$],
    ['consigli', $q$select r.id from recommendations r
        where r.to_user = %L and r.seen_at is null limit 20$q$],
    ['notifiche', $q$select n.id from notifications n
        where n.user_id = %L and n.read_at is null
        order by n.created_at desc limit 30$q$]
  ];
  i int;
begin
  -- 1. utenti finti.
  --
  -- Il numero progressivo sta nel **secondo** gruppo dell'uuid, non nell'ultimo:
  -- il trigger handle_new_user ricava lo username dai primi 12 esadecimali
  -- dell'id, e con il progressivo in coda erano tutti 'user_beeeeeee0000',
  -- cioe' una violazione di profiles_username_key alla seconda riga.
  select array_agg(
           ('beeeeeee-' || lpad(to_hex(g), 4, '0') || '-4000-8000-000000000000')::uuid
         )
    into ids
    from generate_series(1, n_utenti) g;

  -- handle_new_user crea gia' la riga in profiles: qui basta l'utente.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'bench+' || u || '@example.invalid', '', now(), now(), now()
  from unnest(ids) u;

  -- 2. librerie: n_entry_per_utente righe a testa, sui titoli veri gia' in cache.
  --
  -- Senza questa riga il trigger watch_entries_activity scriverebbe **una
  -- attivita' per ogni entry**, cioe' mezzo milione di righe in activities: e'
  -- lo stesso interruttore che usa la RPC dell'import Netflix per non
  -- inondare il feed.
  perform set_config('zapp.skip_activities', 'true', true);

  -- Nota: il trigger watch_entries_set_updated_at riscrive updated_at con now(),
  -- quindi le date sotto valgono solo per last_watched_at e created_at. Va bene:
  -- quello che si misura e' quante righe per utente vanno scorse, non la loro eta'.
  insert into watch_entries (user_id, title_id, media_type, status, last_watched_at,
                             created_at, updated_at)
  select u.u, t.id, t.media_type,
         (array['watching','watched','want'])[1 + (t.id % 3)]::watch_status,
         now() - (t.id % 365) * interval '1 day',
         now() - (t.id % 365) * interval '1 day',
         now() - (t.id % 365) * interval '1 day'
  from unnest(ids) u(u)
  cross join lateral (
    select id, media_type from titles order by id limit n_entry_per_utente
  ) t
  on conflict (user_id, title_id, media_type) do nothing;

  -- 3. grafo di amicizie: ognuno amico degli 8 successivi. Si inseriscono gia'
  -- 'accepted': notify_friendship scrive notifiche solo sugli inserimenti
  -- 'pending' e sui passaggi pending -> accepted, quindi cosi' non ne genera.
  insert into friendships (requester_id, addressee_id, status)
  -- Alias `gi`/`gk` e non `i`/`k`: `i` e' gia' una variabile plpgsql (il contatore
  -- del ciclo delle misure) e Postgres rifiuta il riferimento ambiguo.
  select ids[gi], ids[1 + ((gi + gk - 1) % n_utenti)], 'accepted'
  from generate_series(1, n_utenti) gi, generate_series(1, 8) gk
  on conflict (requester_id, addressee_id) do nothing;

  -- 4. attivita' e notifiche. I valori di `kind` sono vincolati da un check:
  -- activities ammette started/finished/rated/reviewed/wanted/recommended,
  -- notifications friend_request/friend_accepted/recommendation/comment/like.
  insert into activities (user_id, kind, title_id, media_type, is_private, created_at)
  select ids[1 + (g % n_utenti)], 'finished', t.id, t.media_type, false,
         now() - (g % 60) * interval '1 hour'
  from generate_series(1, 50000) g
  cross join lateral (select id, media_type from titles offset (g % 100) limit 1) t;

  insert into notifications (user_id, kind, payload, created_at)
  select ids[1 + (g % n_utenti)], 'friend_accepted',
         jsonb_build_object('from_user', ids[1 + ((g + 1) % n_utenti)]),
         now() - (g % 60) * interval '1 hour'
  from generate_series(1, 20000) g;

  analyze watch_entries;
  analyze activities;
  analyze notifications;
  analyze friendships;

  -- 5. misure, con la sessione che finge di essere il primo utente finto
  soggetto := ids[1];
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', soggetto, 'role', 'authenticated')::text,
                     true);

  -- Ogni query si misura piu' volte e si tiene il **minimo**: su un'istanza
  -- condivisa una singola corsa oscilla fra 2 e 12 ms sullo stesso identico
  -- stato, e su quel rumore non si decide niente. Il minimo e' il tempo che la
  -- query impiega quando non la disturba nessuno, ed e' l'unico numero
  -- confrontabile fra due configurazioni.
  for i in 1 .. array_length(coppie, 1) loop
    nome := coppie[i][1];
    sql_text := format(coppie[i][2], soggetto, soggetto, soggetto);
    minimo := null;
    for giro in 1 .. greatest(1, giri) loop
      execute 'explain (analyze, buffers, format json) ' || sql_text into piano;
      ms := (piano->0->'Plan'->>'Actual Total Time')::numeric;
      if minimo is null or ms < minimo then
        minimo := ms;
        piano_migliore := piano;
      end if;
    end loop;
    esiti := esiti || jsonb_build_object(
      'nome', nome, 'ms', round(minimo, 3), 'piano', piano_migliore
    );
  end loop;

  perform set_config('role', 'postgres', true);

  -- 6. pulizia: l'ordine segue le chiavi esterne
  delete from notifications where user_id = any(ids);
  delete from activities where user_id = any(ids);
  delete from friendships where requester_id = any(ids) or addressee_id = any(ids);
  delete from watch_entries where user_id = any(ids);
  delete from profiles where id = any(ids);
  delete from auth.users where id = any(ids);

  return jsonb_build_object('utenti', n_utenti, 'query', esiti);
exception when others then
  perform set_config('role', 'postgres', true);
  delete from notifications where user_id = any(ids);
  delete from activities where user_id = any(ids);
  delete from friendships where requester_id = any(ids) or addressee_id = any(ids);
  delete from watch_entries where user_id = any(ids);
  delete from profiles where id = any(ids);
  delete from auth.users where id = any(ids);
  raise;
end;
$fn$;

revoke all on function public.bench_scale(int, int, int) from public, anon, authenticated;
