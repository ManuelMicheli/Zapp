-- Attori e registi che l'utente ha dichiarato preferiti.
--
-- `role` usa le stesse due etichette di `title_people` (migration 0026), `Cast` e
-- `Regia`: cosi' la chiave del preferito -- `Cast:Pedro Pascal` -- e' *letteralmente*
-- la chiave che `buildRails` e `appartiene()` confrontano gia' oggi. Due convenzioni
-- diverse per la stessa cosa divergono alla prima modifica.
--
-- `name` e `profile_path` sono copiati da TMDB al momento del preferito: lo scaffale
-- del profilo si disegna con una query sola, senza una chiamata TMDB per cerchio.
--
-- Una persona ha **un solo** ruolo, anche se dirige e recita: la chiave primaria e'
-- (user_id, person_id), e due righe con ruoli diversi non potrebbero coesistere.

create table if not exists public.favorite_people (
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    bigint not null,
  name         text   not null,
  role         text   not null check (role in ('Cast','Regia')),
  profile_path text,
  created_at   timestamptz not null default now(),
  primary key (user_id, person_id)
);

-- L'ordine dello scaffale e' "l'ultimo preferito per primo": la PK non basta.
create index if not exists favorite_people_user_idx
  on public.favorite_people (user_id, created_at desc);

alter table public.favorite_people enable row level security;

-- Stessa visibilita' di watch_entries (migration 0028): propri, piu' quelli degli
-- amici. `(select auth.uid())` e non `auth.uid()`: la seconda forma Postgres la
-- valuta riga per riga (migration 0029).
drop policy if exists favorite_people_select on public.favorite_people;
create policy favorite_people_select on public.favorite_people
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.my_friend_ids())
  );

drop policy if exists favorite_people_insert on public.favorite_people;
create policy favorite_people_insert on public.favorite_people
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists favorite_people_delete on public.favorite_people;
create policy favorite_people_delete on public.favorite_people
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nessuna policy di update: un preferito si mette e si toglie, non si modifica.
