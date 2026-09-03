-- Zapp — migration 0001: fondamenta (enums, profiles, cache TMDB, watch entries, RLS)

-- ============ enums ============
create type public.media_type as enum ('movie', 'tv');
create type public.watch_status as enum ('want', 'watching', 'watched', 'dropped');

-- ============ helper updated_at ============
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  is_private boolean not null default false,
  -- null finché l'utente non sceglie lo username nell'onboarding;
  -- il trigger sotto assegna un placeholder "user_<hex>" per rispettare il NOT NULL
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- trigger: alla creazione di un utente auth, crea la riga profilo
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ cache titoli TMDB ============
create table public.titles (
  id bigint not null,
  media_type public.media_type not null,
  title text not null,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  vote_average numeric(3,1),
  vote_count int,
  genres jsonb,
  runtime int,
  number_of_seasons int,
  number_of_episodes int,
  external_ids jsonb,
  raw jsonb,
  fetched_at timestamptz not null default now(),
  primary key (id, media_type)
);

create index titles_fetched_at_idx on public.titles (fetched_at);

-- ============ disponibilità streaming IT ============
create table public.title_providers (
  title_id bigint not null,
  media_type public.media_type not null,
  provider_id int not null,
  provider_name text not null,
  logo_path text,
  kind text not null check (kind in ('flatrate', 'rent', 'buy')),
  fetched_at timestamptz not null default now(),
  primary key (title_id, media_type, provider_id, kind),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete cascade
);

-- ============ link diretti alle piattaforme (resolver in Fase 2) ============
create table public.title_provider_links (
  title_id bigint not null,
  media_type public.media_type not null,
  provider_id int not null,
  url text not null,
  source text not null check (source in ('manual', 'wikidata', 'search')),
  resolved_at timestamptz not null default now(),
  primary key (title_id, media_type, provider_id),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete cascade
);

create index title_provider_links_resolved_at_idx on public.title_provider_links (resolved_at);

-- ============ watch entries (tabella centrale) ============
create table public.watch_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  status public.watch_status not null,
  rating smallint check (rating between 1 and 10),
  season_number int,
  episode_number int,
  is_private boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create trigger watch_entries_set_updated_at
  before update on public.watch_entries
  for each row execute function public.set_updated_at();

create index watch_entries_user_status_idx
  on public.watch_entries (user_id, status, updated_at desc);

-- ============ log episodi visti ============
create table public.episode_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  season_number int not null,
  episode_number int not null,
  watched_at timestamptz not null default now(),
  unique (user_id, title_id, season_number, episode_number)
);

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.title_providers enable row level security;
alter table public.title_provider_links enable row level security;
alter table public.watch_entries enable row level security;
alter table public.episode_watches enable row level security;

-- profiles: lettura pubblica, scrittura solo del proprio
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- watch_entries: solo le proprie righe (policy amici in Fase 4, additiva)
create policy "watch_entries_select_own" on public.watch_entries
  for select using (auth.uid() = user_id);
create policy "watch_entries_insert_own" on public.watch_entries
  for insert with check (auth.uid() = user_id);
create policy "watch_entries_update_own" on public.watch_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watch_entries_delete_own" on public.watch_entries
  for delete using (auth.uid() = user_id);

-- episode_watches: solo le proprie righe
create policy "episode_watches_select_own" on public.episode_watches
  for select using (auth.uid() = user_id);
create policy "episode_watches_insert_own" on public.episode_watches
  for insert with check (auth.uid() = user_id);
create policy "episode_watches_update_own" on public.episode_watches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "episode_watches_delete_own" on public.episode_watches
  for delete using (auth.uid() = user_id);

-- cache TMDB: lettura pubblica, scrittura solo service role (nessuna policy di scrittura)
create policy "titles_select_all" on public.titles
  for select using (true);
create policy "title_providers_select_all" on public.title_providers
  for select using (true);
create policy "title_provider_links_select_all" on public.title_provider_links
  for select using (true);
