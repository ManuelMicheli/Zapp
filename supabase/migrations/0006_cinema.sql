-- Zapp — migration 0006: cinema vicino a te (posizione, match MovieGlu, link, piani)

-- posizione dell'utente (GPS o città scelta): usata per cinema e orari
alter table public.profiles
  add column location_lat double precision,
  add column location_lng double precision,
  add column location_label text,
  add column location_updated_at timestamptz;

-- match TMDB → MovieGlu (dati di sistema, scritti solo dal service role)
create table public.cinema_films (
  tmdb_id bigint primary key,
  -- null = film non in programmazione al momento del match
  movieglu_film_id integer,
  imdb_id text,
  title text,
  poster_path text,
  backdrop_path text,
  fetched_at timestamptz not null default now()
);
create index cinema_films_movieglu_idx on public.cinema_films (movieglu_film_id);

-- link biglietteria per cinema (manual mai sovrascritto; movieglu = sito del cinema)
create table public.cinema_links (
  cinema_id integer primary key,
  -- null con source 'movieglu' = MovieGlu non conosce il sito; si ritenta dopo il TTL
  url text,
  source text not null check (source in ('manual', 'movieglu')),
  fetched_at timestamptz not null default now()
);

-- "Ci vado": serata al cinema pianificata dall'utente
create table public.cinema_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tmdb_id bigint not null,
  film_title text not null,
  poster_path text,
  backdrop_path text,
  cinema_id integer not null,
  cinema_name text not null,
  cinema_address text not null,
  cinema_lat double precision,
  cinema_lng double precision,
  starts_at timestamptz not null,
  format text,
  booking_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, starts_at)
);
create index cinema_plans_user_starts_idx on public.cinema_plans (user_id, starts_at);

-- RLS: le tabelle di sistema restano senza policy (solo service role);
-- i piani sono visibili e modificabili solo dal proprietario.
alter table public.cinema_films enable row level security;
alter table public.cinema_links enable row level security;
alter table public.cinema_plans enable row level security;

create policy "cinema_plans_select_own" on public.cinema_plans
  for select using (auth.uid() = user_id);
create policy "cinema_plans_insert_own" on public.cinema_plans
  for insert with check (auth.uid() = user_id);
create policy "cinema_plans_delete_own" on public.cinema_plans
  for delete using (auth.uid() = user_id);
