-- Zapp — migration 0063: le richieste dei dati alle piattaforme.
-- Disney+, NOW e Apple TV non hanno una cronologia scaricabile: l'unica strada al
-- pregresso e' la richiesta formale, che arriva dopo giorni. Senza memoria,
-- l'utente la chiede e se ne dimentica: qui si segna quando l'ha chiesta e quando
-- dovrebbe arrivare, e un job glielo ricorda.

create table if not exists public.import_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_key text not null,
  requested_at timestamptz not null default now(),
  expected_at date not null,
  state text not null default 'requested'
    constraint import_requests_state_check
    check (state in ('requested', 'imported', 'dismissed')),
  reminded_at timestamptz,
  -- Il secondo (e ultimo) sollecito, sette giorni dopo il primo: senza questa
  -- colonna il job non saprebbe distinguere "ne ho gia' mandati due" da "ne ho
  -- mandato uno sette giorni fa", e ripeterebbe il sollecito ogni giorno per
  -- sempre invece di fermarsi al secondo (vedi `prossimoPromemoria`,
  -- `src/lib/import/richieste.ts`).
  second_reminded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists import_requests_user_idx
  on public.import_requests (user_id, state);
-- Il job cerca le richieste scadute e non ancora ricordate: questo indice e' la
-- sua unica query per il primo sollecito.
create index if not exists import_requests_due_idx
  on public.import_requests (expected_at)
  where state = 'requested' and reminded_at is null;
-- Stessa idea per il secondo sollecito: le richieste gia' ricordate una volta,
-- non ancora una seconda, in attesa dei sette giorni.
create index if not exists import_requests_due_again_idx
  on public.import_requests (reminded_at)
  where state = 'requested' and reminded_at is not null and second_reminded_at is null;
-- Una sola richiesta aperta per utente+piattaforma: senza questo vincolo, due
-- clic ravvicinati sul bottone (o un ritentativo di rete) passano entrambi il
-- controllo applicativo prima che il primo insert sia committato, e restano
-- due righe 'requested' per la stessa piattaforma — card doppie, due
-- promemoria. La garanzia e' qui, non nel controllo applicativo (che resta,
-- ma solo per evitare il giro a vuoto nel caso normale): segnaRichiesta legge
-- la violazione di questo indice (23505) come "c'e' gia'", non come errore.
create unique index if not exists import_requests_open_unique
  on public.import_requests (user_id, platform_key)
  where state = 'requested';

alter table public.import_requests enable row level security;

-- Stessa forma di user_platforms (migration 0062): `(select auth.uid())` e non
-- `auth.uid()`, perche' Postgres valuta la seconda riga per riga (migration 0029).
-- Qui pero' serve anche `update`, perche' lo stato di una riga cambia nel tempo
-- (da 'requested' a 'imported' quando l'utente carica il file, o 'dismissed' se
-- rinuncia) invece di essere sostituita cancellando e reinserendo.
drop policy if exists import_requests_select_own on public.import_requests;
create policy import_requests_select_own on public.import_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists import_requests_insert_own on public.import_requests;
create policy import_requests_insert_own on public.import_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists import_requests_update_own on public.import_requests;
create policy import_requests_update_own on public.import_requests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists import_requests_delete_own on public.import_requests;
create policy import_requests_delete_own on public.import_requests
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Un nuovo tipo di notifica per il job che ricorda l'arrivo dell'export.
-- L'elenco e' copiato per intero dalla 0044 (l'ultima che lo ha toccato), non
-- ricordato: allargare questo vincolo vuol dire riscriverlo, e perdere un tipo
-- esistente spegnerebbe in silenzio la notifica corrispondente dentro una
-- transazione che nessuno guarda.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'friend_request', 'friend_accepted', 'recommendation', 'comment', 'like',
    'content_hidden', 'report_outcome', 'export_pronto'
  ));

-- Il job giornaliero: stessa forma di quelli in 0021_jobs_cron.sql, stesso
-- `call_zapp_job` (segreto dal Vault, URL di produzione). Un orario mattutino
-- (le 8 UTC, le 9-10 in Italia) arriva con l'utente gia' sveglio: chi aspetta
-- un export non ha fretta al minuto, a differenza delle classifiche orarie.
select cron.schedule('zapp-promemoria-export', '0 8 * * *',
  $$select public.call_zapp_job('promemoria-export')$$);
