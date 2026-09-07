-- Zapp — migration 0024: classifica dei titoli "dello stesso filone".
-- Dato di sistema scritto dal service client (come title_trailers): `items` è la
-- classifica impersonale, uguale per tutti, e `seed` l'identikit da cui è nata
-- (keyword, saga, autore), così un ricalcolo non deve rileggere titles.raw.
-- Il pezzo personale — il gusto di chi guarda — non entra qui: si applica in
-- memoria, per utente, sulla home.

create table public.title_similar (
  title_id bigint not null,
  media_type public.media_type not null,
  items jsonb not null default '[]'::jsonb,
  seed jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);

alter table public.title_similar enable row level security;

-- Come per i trailer: chiunque può leggere, solo il service client scrive.
create policy "title_similar_select_all" on public.title_similar
  for select using (true);
