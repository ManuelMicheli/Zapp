-- Zapp — migration 0062: le piattaforme che l'utente dichiara di avere.
-- Chiesta all'iscrizione per portarlo subito agli import delle sue cronologie, ma
-- il dato serve anche oltre: la home filtrata per piattaforma e il "dove lo guardo"
-- leggono lo stesso elenco. La chiave e' la `key` del catalogo condiviso
-- (src/lib/platforms/catalog.ts), non un id TMDB: il catalogo mappa gia' la key su
-- providerId e sugli id secondari (Prime con pubblicita', canali Amazon).

create table if not exists public.user_platforms (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, platform_key)
);

alter table public.user_platforms enable row level security;

-- Stessa forma di favorite_people (migration 0054): `(select auth.uid())` e non
-- `auth.uid()`, perche' Postgres valuta la seconda riga per riga (migration 0029).
-- Nessuna policy di update: l'insieme si sostituisce cancellando e inserendo
-- (`setUserPlatforms`), non si modifica riga per riga.
drop policy if exists user_platforms_select_own on public.user_platforms;
create policy user_platforms_select_own on public.user_platforms
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_platforms_insert_own on public.user_platforms;
create policy user_platforms_insert_own on public.user_platforms
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_platforms_delete_own on public.user_platforms;
create policy user_platforms_delete_own on public.user_platforms
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nota: applicata al database il 2026-09-15 col nome `0061_user_platforms`, poi
-- rinumerata perche' un'altra sessione aveva gia' pubblicato la sua `0061_rank_tuning`
-- su main. Sul DB non c'e' stato nessun conflitto (la storia remota e' a timestamp);
-- nel repo due file con lo stesso numero confondono e basta. E' la seconda volta in un
-- giorno: annunciare il numero prima di scriverlo non basta se chi lo prende non
-- risponde — va verificato anche su origin/main appena prima di rilasciare.
