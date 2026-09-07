-- Fase A dell'algoritmo: segnali utente.
--
-- Tre principi, tutti già pagati altrove in questo progetto:
--  * i dati personali stanno in tabelle private, mai in `profiles` (che è leggibile
--    da chiunque via `user_search` e dai profili pubblici) — come `user_locations`;
--  * niente foreign key verso `titles` sugli eventi: una copertina di ricerca può
--    essere di un titolo non ancora in cache, e perdere quell'evento sarebbe un buco
--    silenzioso proprio sui titoli nuovi;
--  * il profilo calcolato lo scrive solo il service client, come `job_runs`.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- solo l'anno, mai la data completa. Il limite è letterale: Postgres rifiuta le
  -- funzioni non immutabili (`extract(year from now())`) dentro un check.
  birth_year smallint check (birth_year between 1900 and 2100),
  personalization_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy user_preferences_select_own on public.user_preferences
  for select using (auth.uid() = user_id);
create policy user_preferences_insert_own on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy user_preferences_update_own on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create type public.signal_kind as enum (
  'impression', 'open', 'provider_open', 'trailer_play', 'dismiss',
  'library_add', 'rate'
);

create table public.user_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.signal_kind not null,
  title_id bigint,
  media_type public.media_type,
  surface text not null,
  position smallint,
  session_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.user_events enable row level security;

create policy user_events_select_own on public.user_events
  for select using (auth.uid() = user_id);
create policy user_events_insert_own on public.user_events
  for insert with check (auth.uid() = user_id);
create policy user_events_delete_own on public.user_events
  for delete using (auth.uid() = user_id);
-- nessuna policy di update: un evento è un fatto, non si corregge

create index user_events_utente_idx on public.user_events (user_id, created_at desc);
create index user_events_potatura_idx on public.user_events (created_at);

-- Il vero risparmio: una impression ripetuta nella stessa sessione costa un
-- `on conflict do nothing`, non una riga. Senza, una home scorsa avanti e indietro
-- scriverebbe centinaia di righe identiche.
create unique index user_events_impression_unica_idx
  on public.user_events (user_id, session_id, title_id, media_type, surface)
  where kind = 'impression';

create table public.user_seed_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id, media_type)
);

alter table public.user_seed_picks enable row level security;

create policy user_seed_picks_select_own on public.user_seed_picks
  for select using (auth.uid() = user_id);
create policy user_seed_picks_insert_own on public.user_seed_picks
  for insert with check (auth.uid() = user_id);
create policy user_seed_picks_delete_own on public.user_seed_picks
  for delete using (auth.uid() = user_id);

create table public.user_taste (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generi jsonb not null default '{}'::jsonb,
  decenni jsonb not null default '{}'::jsonb,
  provider jsonb not null default '{}'::jsonb,
  persone jsonb not null default '{}'::jsonb,
  tipo jsonb not null default '{}'::jsonb,
  runtime jsonb not null default '{}'::jsonb,
  lingua jsonb not null default '{}'::jsonb,
  novita real,
  massa real not null default 0,
  eventi_contati integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_taste enable row level security;

-- Sola lettura e cancellazione per il proprietario: la riga la scrive il job col
-- service client, ma spegnere la personalizzazione deve poterla cancellare davvero.
create policy user_taste_select_own on public.user_taste
  for select using (auth.uid() = user_id);
create policy user_taste_delete_own on public.user_taste
  for delete using (auth.uid() = user_id);

-- Tutto ciò che serve al calcolo, già ridotto a una riga per titolo.
--
-- Lo `skip` non è un evento che manda il client: è `impression_sessioni > 0 and
-- aperture = 0`. Contiamo le **sessioni** distinte con impression, non le impression:
-- dieci scroll nella stessa sessione sono una noia sola, non dieci rifiuti.
create or replace function public.taste_input(uid uuid)
returns table (
  title_id bigint,
  media_type public.media_type,
  status public.watch_status,
  rating smallint,
  last_watched_at timestamptz,
  is_seed boolean,
  impression_sessioni integer,
  aperture integer,
  provider_aperture integer,
  trailer integer,
  dismissi integer,
  ultimo_evento timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  with eventi as (
    select e.title_id,
           e.media_type,
           count(distinct e.session_id) filter (where e.kind = 'impression') as impression_sessioni,
           count(*) filter (where e.kind = 'open')                           as aperture,
           count(*) filter (where e.kind = 'provider_open')                  as provider_aperture,
           count(*) filter (where e.kind = 'trailer_play')                   as trailer,
           count(*) filter (where e.kind = 'dismiss')                        as dismissi,
           max(e.created_at)                                                 as ultimo_evento
    from public.user_events e
    where e.user_id = uid
      and e.title_id is not null
      and e.media_type is not null
      and e.created_at > now() - interval '90 days'
    group by e.title_id, e.media_type
  ),
  libreria as (
    select w.title_id::bigint as title_id, w.media_type, w.status, w.rating, w.last_watched_at
    from public.watch_entries w
    where w.user_id = uid
  ),
  seed as (
    select s.title_id, s.media_type
    from public.user_seed_picks s
    where s.user_id = uid
  ),
  chiavi as (
    select title_id, media_type from eventi
    union
    select title_id, media_type from libreria
    union
    select title_id, media_type from seed
  )
  select k.title_id,
         k.media_type,
         l.status,
         l.rating::smallint,
         l.last_watched_at,
         (s.title_id is not null)                  as is_seed,
         coalesce(ev.impression_sessioni, 0)::int  as impression_sessioni,
         coalesce(ev.aperture, 0)::int             as aperture,
         coalesce(ev.provider_aperture, 0)::int    as provider_aperture,
         coalesce(ev.trailer, 0)::int              as trailer,
         coalesce(ev.dismissi, 0)::int             as dismissi,
         ev.ultimo_evento
  from chiavi k
  left join eventi   ev on ev.title_id = k.title_id and ev.media_type = k.media_type
  left join libreria l  on l.title_id  = k.title_id and l.media_type  = k.media_type
  left join seed     s  on s.title_id  = k.title_id and s.media_type  = k.media_type
  order by greatest(
    coalesce(l.last_watched_at, 'epoch'::timestamptz),
    coalesce(ev.ultimo_evento, 'epoch'::timestamptz)
  ) desc
  limit 1000;
$fn$;

revoke all on function public.taste_input(uuid) from public, anon, authenticated;

-- Gli utenti con qualcosa di nuovo dall'ultimo ricalcolo, i più fermi per primi.
create or replace function public.taste_refresh_queue(want integer)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $fn$
  with ultimo_segnale as (
    select p.id as user_id,
           greatest(
             coalesce((select max(e.created_at) from public.user_events e where e.user_id = p.id), 'epoch'::timestamptz),
             coalesce((select max(w.updated_at) from public.watch_entries w where w.user_id = p.id), 'epoch'::timestamptz),
             coalesce((select max(s.created_at) from public.user_seed_picks s where s.user_id = p.id), 'epoch'::timestamptz)
           ) as ultimo
    from public.profiles p
  )
  select u.user_id
  from ultimo_segnale u
  left join public.user_preferences pr on pr.user_id = u.user_id
  left join public.user_taste t on t.user_id = u.user_id
  where u.ultimo > 'epoch'::timestamptz
    and coalesce(pr.personalization_enabled, true)
    and (t.updated_at is null or u.ultimo > t.updated_at)
  order by coalesce(t.updated_at, 'epoch'::timestamptz)
  limit greatest(1, want);
$fn$;

revoke all on function public.taste_refresh_queue(integer) from public, anon, authenticated;
