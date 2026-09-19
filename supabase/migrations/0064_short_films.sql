-- Cortometraggi: cosa l'utente ha visto e cosa ha messo tra i preferiti.
--
-- Il catalogo dei corti **non** sta nel database: e' un file curato
-- (`src/data/short-films.json`, cento titoli con trama, genere e id YouTube). Qui
-- sta solo cio' che appartiene all'utente, cioe' l'unica cosa che il file non puo'
-- sapere. Stessa scelta di `src/data/genre-picks.json`: un catalogo che cambia con
-- un rilascio non ha bisogno di una tabella, e una tabella in piu' e' una policy in
-- piu' da tenere giusta.
--
-- La chiave e' l'id del video YouTube e non lo slug: lo slug e' il titolo ripulito e
-- puo' cambiare quando si corregge un titolo, l'id no. Se un corto sparisce dal
-- catalogo la riga resta, inerte, e non da' fastidio a nessuno.
--
-- Una riga esiste solo se dice qualcosa (visto **o** preferito): il vincolo
-- impedisce che restino righe vuote dopo un doppio tocco.

create table if not exists public.short_film_entries (
  user_id    uuid not null references auth.users(id) on delete cascade,
  short_id   text not null check (short_id ~ '^[A-Za-z0-9_-]{11}$'),
  watched_at timestamptz,
  favorite   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, short_id),
  constraint short_film_entries_non_vuota check (watched_at is not null or favorite)
);

-- "I corti che hai visto, dal piu' recente": la PK non ordina per data.
create index if not exists short_film_entries_watched_idx
  on public.short_film_entries (user_id, watched_at desc)
  where watched_at is not null;

-- "I tuoi preferiti": indice parziale, i preferiti sono pochi per utente.
create index if not exists short_film_entries_favorite_idx
  on public.short_film_entries (user_id, created_at desc)
  where favorite;

alter table public.short_film_entries enable row level security;

-- Solo i propri, in lettura e in scrittura: a differenza di `watch_entries` e
-- `favorite_people` i corti non compaiono nel feed degli amici, quindi nessuno
-- ha motivo di leggerli. Meno superficie, meno da tenere giusto; il giorno in cui
-- serviranno agli amici si aggiunge `or user_id in (select public.my_friend_ids())`
-- come nelle altre tabelle.
--
-- `(select auth.uid())` e non `auth.uid()`: la seconda forma Postgres la valuta
-- riga per riga (migration 0029).
drop policy if exists short_film_entries_select on public.short_film_entries;
create policy short_film_entries_select on public.short_film_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists short_film_entries_insert on public.short_film_entries;
create policy short_film_entries_insert on public.short_film_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- L'update serve davvero: "visto" e "preferito" sono due interruttori sulla stessa
-- riga, e accenderne uno quando l'altro c'e' gia' e' un update, non un insert.
drop policy if exists short_film_entries_update on public.short_film_entries;
create policy short_film_entries_update on public.short_film_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists short_film_entries_delete on public.short_film_entries;
create policy short_film_entries_delete on public.short_film_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));
