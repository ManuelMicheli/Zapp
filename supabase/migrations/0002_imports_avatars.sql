-- Zapp — migration 0002: log import (Fase 3) + bucket avatar

-- ============ imports ============
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('netflix')),
  rows int not null,
  matched int not null,
  created_at timestamptz not null default now()
);

alter table public.imports enable row level security;

create policy "imports_select_own" on public.imports
  for select using (auth.uid() = user_id);
create policy "imports_insert_own" on public.imports
  for insert with check (auth.uid() = user_id);

-- ============ storage: bucket avatars ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- lettura pubblica, scrittura solo nella propria cartella <uid>/...
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
