-- Notifiche push dell'app nativa (Zapp Mobile, fase 1).
-- Scrive solo il service role: i token Expo non devono essere leggibili ne'
-- scrivibili dal client, e i biglietti (ticket) servono solo al job delle ricevute.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  expo_token text not null unique,            -- "ExponentPushToken[...]"
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);
create index push_tokens_device_idx on public.push_tokens (device_id);

create table public.push_tickets (
  ticket_id text primary key,                 -- id restituito da Expo per ogni messaggio
  token_id uuid not null references public.push_tokens (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index push_tickets_created_idx on public.push_tickets (created_at);

alter table public.push_tokens enable row level security;
alter table public.push_tickets enable row level security;
revoke all on public.push_tokens from anon, authenticated;
revoke all on public.push_tickets from anon, authenticated;

-- Le notifiche in-app diventano push: la colonna segna cosa e' gia' stato spinto
-- (o valutato e scartato). Le righe vecchie non vanno rispinte: si marcano ora.
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = now() where pushed_at is null;
create index notifications_da_spingere_idx on public.notifications (created_at)
  where pushed_at is null;

-- Ogni notifica nuova sveglia il job `push-send` (pg_net, in coda, fuori dalla
-- transazione dell'utente). Se il job e' gia' in corso risponde 409 e la riga
-- resta per il giro dopo: il cron ogni 5 minuti fa da rete di sicurezza.
create or replace function public.notifications_push_wake()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
begin
  begin
    perform public.call_zapp_job('push-send');
  exception when others then
    -- niente segreto o pg_net giu': la notifica in-app resta valida, il push
    -- arrivera' col cron. Mai far fallire l'insert per colpa del push.
    null;
  end;
  return null;
end;
$$;
revoke all on function public.notifications_push_wake() from public, anon, authenticated;

create trigger notifications_push_wake
  after insert on public.notifications
  for each row execute function public.notifications_push_wake();

select cron.schedule('zapp-push-send', '*/5 * * * *', $$select public.call_zapp_job('push-send')$$);
select cron.schedule('zapp-push-receipts', '13,43 * * * *', $$select public.call_zapp_job('push-receipts')$$);
-- La domanda del giorno alle 09:00 di Roma (pg_cron e' in UTC: 07:00 d'estate,
-- 08:00 d'inverno; si accetta l'ora di scarto).
select cron.schedule('zapp-push-daily', '0 7 * * *', $$select public.call_zapp_job('push-daily')$$);
