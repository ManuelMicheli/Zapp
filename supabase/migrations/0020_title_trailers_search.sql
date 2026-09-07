-- Governo della quota di ricerca YouTube (search.list costa 100 unità su 10.000 al
-- giorno: 100 ricerche al giorno per un catalogo di migliaia di titoli).
-- `search_at` è l'ultimo tentativo di ricerca del trailer italiano, `search_tries`
-- quanti ne sono stati fatti: al terzo si smette, così un titolo che in italiano non
-- esiste non consuma quota per sempre.
alter table public.title_trailers
  add column if not exists search_at timestamptz,
  add column if not exists search_tries smallint not null default 0;

comment on column public.title_trailers.search_at is
  'Ultimo tentativo di ricerca YouTube del trailer italiano.';
comment on column public.title_trailers.search_tries is
  'Tentativi di ricerca già spesi (max 3).';
