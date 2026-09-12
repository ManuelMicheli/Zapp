-- supabase/migrations/0043_consensi.sql
-- Consensi versionati: quale testo, quando, e se è stato revocato.
-- Un booleano non basta (art. 7(1) GDPR): non dice a cosa si è acconsentito.

create table public.user_consents (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  kind       text        not null check (kind in ('terms', 'privacy', 'personalization', 'scrobble')),
  version    text        not null check (char_length(version) between 1 and 32),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, kind, version)
);

-- Il gate del layout legge tutte le righe di un utente a ogni richiesta.
create index user_consents_utente_idx on public.user_consents (user_id);

alter table public.user_consents enable row level security;

-- Una sola policy permissiva per comando: due si valuterebbero entrambe per riga.
create policy user_consents_select_own on public.user_consents
  for select to authenticated using (user_id = (select auth.uid()));

create policy user_consents_insert_own on public.user_consents
  for insert to authenticated with check (user_id = (select auth.uid()));

-- L'update esiste solo per revocare. Il `with check` ripete la proprietà:
-- senza, si potrebbe spostare la riga su un altro utente.
create policy user_consents_update_own on public.user_consents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nessuna policy di delete: la revoca è una data, non una riga che sparisce.
-- Cancellare la prova di un consenso passato è esattamente ciò che non si vuole.

-- Una tabella nuova nasce con un grant pieno per `authenticated` (verificato su
-- questo progetto: `relacl` di una tabella appena creata porta già
-- `authenticated=arwdDxtm/...`, lo stesso motivo per cui 0038_watching_now.sql
-- fa `revoke all ... from authenticated` prima di ri-concedere). Senza questo
-- passo il grant per colonna su UPDATE più sotto non restringerebbe niente: il
-- grant di tabella preesistente coprirebbe già tutte le colonne, e chiunque
-- potrebbe riscrivere `user_id`/`kind`/`version` — cioè falsificare a quale
-- documento e a nome di chi si è acconsentito.
revoke all on table public.user_consents from public, anon, authenticated;
grant select, insert on public.user_consents to authenticated;
-- Grant per colonna, ma **due** colonne, non una sola.
--
-- `revoked_at` serve alla revoca. `granted_at` serve alla riconcessione: l'upsert
-- di PostgREST genera un `on conflict do update` su **tutte** le colonne del
-- payload, non solo su quelle che cambiano, quindi con il solo grant su
-- `revoked_at` ogni riconcessione fallirebbe con "permission denied for column".
-- È la trappola già documentata in security.md per `profiles` e `reviews`.
--
-- Restano fuori `user_id`, `kind` e `version`: sono la chiave primaria, quindi
-- riscriverle significherebbe un'altra riga, non la stessa modificata. Il testo
-- accettato resta inalterabile.
grant update (granted_at, revoked_at) on public.user_consents to authenticated;

-- Personalizzazione spenta per chi si iscrive da adesso. Le righe esistenti NON
-- si toccano: il default vale solo per gli insert futuri, ed è voluto — i 16
-- utenti attuali scelgono dal foglio, non gli si cambia la home sotto i piedi.
alter table public.user_preferences
  alter column personalization_enabled set default false;
