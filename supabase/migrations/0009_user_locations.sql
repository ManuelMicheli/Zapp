-- Zapp — migration 0009: posizione dell'utente in una tabella propria.
-- `profiles` è leggibile da tutti (profiles_select_all): le coordinate GPS non possono
-- starci. `user_locations` è visibile e modificabile solo dal proprietario.

create table public.user_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  label text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_locations enable row level security;

create policy "user_locations_select_own" on public.user_locations
  for select using (auth.uid() = user_id);
create policy "user_locations_insert_own" on public.user_locations
  for insert with check (auth.uid() = user_id);
create policy "user_locations_update_own" on public.user_locations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_locations_delete_own" on public.user_locations
  for delete using (auth.uid() = user_id);

-- migra le posizioni già salvate, poi toglie le colonne pubbliche
insert into public.user_locations (user_id, lat, lng, label, updated_at)
  select id, location_lat, location_lng,
         coalesce(location_label, 'Posizione attuale'),
         coalesce(location_updated_at, now())
  from public.profiles
  where location_lat is not null and location_lng is not null;

alter table public.profiles
  drop column location_lat,
  drop column location_lng,
  drop column location_label,
  drop column location_updated_at;
