-- Zapp — migration 0010: cinema con fonte gratuita (MyMovies)

-- cinema di una provincia con coordinate (dati di sistema: solo service role)
create table public.cinema_venues (
  mymovies_id integer primary key,
  province_slug text not null,
  path text not null,
  name text not null,
  town text not null,
  address text,
  lat double precision,
  lng double precision,
  fetched_at timestamptz not null default now()
);
create index cinema_venues_province_idx on public.cinema_venues (province_slug);
alter table public.cinema_venues enable row level security;

-- id film MyMovies accanto a quello MovieGlu
alter table public.cinema_films add column mymovies_film_id integer;
create index cinema_films_mymovies_idx on public.cinema_films (mymovies_film_id);

-- provincia MyMovies calcolata al salvataggio della posizione
alter table public.user_locations add column province_slug text;
