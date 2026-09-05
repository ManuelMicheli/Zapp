-- Zapp — migration 0011: cache dei trailer trovati con la ricerca YouTube (Data API).
-- Dato di sistema scritto dal service client (come title_provider_links): `keys` sono
-- gli id YouTube in ordine di preferenza, vuoto = ricerca fatta senza risultati
-- (ritentata dopo un giorno: il trailer di un film in uscita arriva dopo).
-- season_number 0 = scheda titolo, N = pagina della stagione N.

create table public.title_trailers (
  title_id bigint not null,
  media_type public.media_type not null,
  season_number int not null default 0,
  keys text[] not null default '{}',
  checked_at timestamptz not null default now(),
  primary key (title_id, media_type, season_number),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete cascade
);

alter table public.title_trailers enable row level security;

create policy "title_trailers_select_all" on public.title_trailers
  for select using (true);
