-- Taratura dei pesi del motore, per utente.
--
-- Il ciclo chiuso: Zapp guarda cosa ha consigliato, cosa l'utente ha davvero guardato e
-- cosa si e' lasciato scorrere davanti, e da li' capisce su quali leve quella persona si
-- muove — i registi, i generi, la piattaforma. I pesi di partenza (`PESI_BASE` in
-- `src/lib/rank/affinity.ts`) sono la media di tutti, cioe' il ritratto di nessuno.
--
-- I pesi **non** vanno in `user_taste`: quella riga la riscrive per intero
-- `refreshTasteFor` a ogni giro del job orario, e i pesi sparirebbero al primo
-- ricalcolo. E' lo stesso motivo per cui la fase B non mise i voti dentro `titles`.

create table if not exists public.user_rank_weights (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Le sette dimensioni, gia' rinormalizzate a somma 1. Una riga assente, o una chiave
  -- mancante, vale "usa i pesi di partenza": `toPesi` non si fida mai di questa colonna.
  pesi jsonb not null default '{}'::jsonb,
  -- Quanto campione c'era dietro: serve a leggere la riga, non al calcolo.
  successi integer not null default 0,
  rifiuti integer not null default 0,
  -- Il `lift` misurato per dimensione, prima dei limiti. Solo per capire cosa ha
  -- imparato: senza, una taratura storta non si spiega piu' a nessuno.
  lift jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_rank_weights enable row level security;

-- Come `user_taste`: la scrive solo il service client (nessuna policy di insert o
-- update), il proprietario la legge e la puo' cancellare. Un utente che si potesse
-- scrivere i pesi da solo potrebbe farsi una home su misura con un `curl`, il che non
-- e' pericoloso ma nemmeno un dato che abbia senso accettare da fuori.
drop policy if exists user_rank_weights_select_own on public.user_rank_weights;
create policy user_rank_weights_select_own on public.user_rank_weights
  for select using ((select auth.uid()) = user_id);

drop policy if exists user_rank_weights_delete_own on public.user_rank_weights;
create policy user_rank_weights_delete_own on public.user_rank_weights
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- La stanchezza: quante sessioni distinte hanno mostrato una copertina senza che
-- venisse mai aperta.
--
-- Si contano le **sessioni**, non le impression: dieci scroll nella stessa sessione
-- sono una noia sola, non dieci rifiuti. E' la stessa scelta che `taste_input` fa per
-- lo skip, ma qui serve subito e per quel titolo, non al prossimo giro del job e sul
-- profilo.
--
-- `security invoker`: la RLS di `user_events` (select own) decide cosa si vede, e la
-- funzione non puo' diventare un modo di leggere gli eventi di qualcun altro.
create or replace function public.rank_stanchezza(uid uuid, giorni integer default 14)
returns table (title_id bigint, media_type public.media_type, sessioni integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.title_id,
    e.media_type,
    count(distinct e.session_id)::integer as sessioni
  from public.user_events e
  where e.user_id = uid
    and e.kind = 'impression'
    and e.created_at >= now() - (giorni || ' days')::interval
    and not exists (
      select 1
      from public.user_events a
      where a.user_id = uid
        and a.title_id = e.title_id
        and a.media_type = e.media_type
        and a.kind in ('open', 'provider_open', 'trailer_play', 'library_add')
    )
  group by e.title_id, e.media_type
  having count(distinct e.session_id) >= 3;
$$;

-- ---------------------------------------------------------------------------
-- Il campione della taratura: per ogni titolo **che e' stato mostrato**, com'e' finita.
--
-- Solo i titoli con almeno una impression: si sta misurando la qualita' dei consigli,
-- e un titolo che l'utente ha trovato da solo cercandolo non dice niente su di essi.
--
--   forte    l'ha messo in libreria, iniziato, finito, o votato >= 7
--   lieve    ha aperto la scheda, il trailer o la piattaforma
--   rifiuto  l'ha scartato, oppure glielo abbiamo fatto scorrere davanti in >= 2
--            sessioni senza che lo aprisse mai
--
-- I titoli che non ricadono in nessuno dei tre (mostrati una volta sola e ignorati) non
-- escono: una sola occasione non e' un rifiuto.
--
-- Nota sui nomi dell'enum `signal_kind`: il trailer e' `trailer_play`, non `trailer`.
-- Con il nome sbagliato Postgres rifiuta la migration con un 22P02 sul valore
-- dell'enum — il che e' fortuna, perche' in un `in (...)` di testo sarebbe passato in
-- silenzio e avrebbe contato come rifiuto chiunque avesse guardato solo il trailer.
create or replace function public.rank_tune_input(uid uuid, giorni integer default 90)
returns table (
  title_id bigint,
  media_type public.media_type,
  esito text
)
language sql
stable
security invoker
set search_path = public
as $$
  with mostrati as (
    select
      e.title_id,
      e.media_type,
      count(distinct e.session_id) filter (where e.kind = 'impression')::integer as sessioni,
      count(*) filter (where e.kind in ('open', 'provider_open', 'trailer_play'))::integer as aperture,
      count(*) filter (where e.kind = 'dismiss')::integer as scarti
    from public.user_events e
    where e.user_id = uid
      and e.created_at >= now() - (giorni || ' days')::interval
    group by e.title_id, e.media_type
    having count(*) filter (where e.kind = 'impression') > 0
  ),
  esiti as (
    select
      m.title_id,
      m.media_type,
      case
        -- Un "non mostrarmelo piu'" e' il rifiuto piu' esplicito che ci sia: vince su
        -- tutto, anche su un'apertura precedente.
        when m.scarti > 0 then 'rifiuto'
        when w.title_id is not null
         and (coalesce(w.rating, 0) >= 7 or w.status in ('want', 'watching', 'watched'))
          then 'forte'
        when m.aperture > 0 then 'lieve'
        when m.sessioni >= 2 then 'rifiuto'
        else null
      end as esito
    from mostrati m
    left join public.watch_entries w
      on w.user_id = uid
     and w.title_id = m.title_id
     and w.media_type = m.media_type
  )
  select esiti.title_id, esiti.media_type, esiti.esito
  from esiti
  where esiti.esito is not null;
$$;

-- ---------------------------------------------------------------------------
-- Gli utenti da ritarare: chi ha eventi recenti e una taratura piu' vecchia di un
-- giorno (o nessuna). Stessa forma di `taste_refresh_queue`.
create or replace function public.rank_tune_queue(want integer default 200)
returns table (user_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct e.user_id
  from public.user_events e
  left join public.user_rank_weights w on w.user_id = e.user_id
  where e.created_at >= now() - interval '7 days'
    and (w.updated_at is null or w.updated_at < now() - interval '20 hours')
  limit want;
$$;

-- ---------------------------------------------------------------------------
-- Il cron. Alle 03:00 gira `events-prune` e legge le stesse righe: 03:40 le lascia
-- finire, e resta lontano dai job dell'ora piena (ratings), del minuto 20 (trailers) e
-- del minuto 40 dell'ora (taste) — che sono ogni ora, quindi l'unica finestra libera di
-- notte e' questa.
select cron.schedule('zapp-rank-tune', '40 3 * * *',
  $$select public.call_zapp_job('rank-tune')$$);
