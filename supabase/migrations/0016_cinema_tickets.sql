-- Zapp — migration 0016: biglietti acquistati sul piano "Ci vado".
-- L'utente carica screenshot/PDF del biglietto: i QR letti finiscono in
-- `ticket_codes`, l'originale nel bucket privato `tickets` (cartella = user id).

alter table public.cinema_plans
  add column ticket_codes text[] not null default '{}',
  add column ticket_path text,
  add column ticket_added_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tickets', 'tickets', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

create policy "tickets_select_own" on storage.objects
  for select using (
    bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "tickets_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "tickets_update_own" on storage.objects
  for update using (
    bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "tickets_delete_own" on storage.objects
  for delete using (
    bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text
  );
