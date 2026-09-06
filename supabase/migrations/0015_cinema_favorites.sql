-- Zapp — migration 0015: cinema preferiti (al massimo 3 per utente).
-- `cinema_id` è l'id del cinema nella sorgente attiva (MyMovies), come `cinema_links`:
-- cambiando CINEMA_SOURCE la tabella va svuotata. I preferiti vengono sempre prima
-- nelle liste orari, nell'ordine di `position`.

create table public.cinema_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cinema_id integer not null,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (user_id, cinema_id),
  unique (user_id, position)
);

alter table public.cinema_favorites enable row level security;

create policy "cinema_favorites_select_own" on public.cinema_favorites
  for select using (auth.uid() = user_id);
create policy "cinema_favorites_insert_own" on public.cinema_favorites
  for insert with check (auth.uid() = user_id);
create policy "cinema_favorites_update_own" on public.cinema_favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cinema_favorites_delete_own" on public.cinema_favorites
  for delete using (auth.uid() = user_id);
