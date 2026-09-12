-- Coda dei comandi verso una TV collegata. Oggi ne esiste uno solo, "apri
-- questo titolo": la riga porta cosa aprire e **come**, perche' la forma di
-- lancio la decide il server (vedi la spec). La TV esegue senza sapere cosa
-- siano quei campi.
--
-- La stessa riga, dopo la consegna, e' la **dichiarazione**: da quel momento le
-- sessioni senza titolo di quella TV su quella piattaforma valgono come quel
-- titolo, finche' le regole di `src/lib/scrobble/declared.ts` non dicono basta.
-- Per questo `last_position_ms` e `last_seen_at` stanno qui e non altrove: una
-- seconda tabella direbbe le stesse cose due volte.
create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title_id bigint not null,
  media_type public.media_type not null,
  provider_id int not null,

  -- Come aprirlo. `packages` e' in ordine di preferenza: la stessa piattaforma
  -- ha nomi diversi su Fire OS e su Android TV, e quale sia installato lo sa
  -- solo il dispositivo.
  packages text[] not null check (cardinality(packages) between 1 and 4),
  data_uri text,
  extra_deeplink text,
  -- Cosa succedera' davvero, per il testo del bottone: la sonda dice che
  -- Netflix e Disney+ avviano, Prime apre la scheda, NOW apre la home.
  esito_atteso text not null check (esito_atteso in ('avvia', 'scheda', 'app')),

  created_at timestamptz not null default now(),
  -- Vita del COMANDO: oltre, non ha piu' senso eseguirlo. Una TV accesa un'ora
  -- dopo non deve mettersi a riprodurre un film da sola.
  expires_at timestamptz not null,
  delivered_at timestamptz,
  -- Com'e' andata, secondo la TV: senza, un lancio fallito sarebbe muto.
  result text check (result in ('ok', 'assente', 'errore')),

  -- Vita della DICHIARAZIONE (30 minuti dall'ultimo evento attribuito).
  last_position_ms bigint,
  last_seen_at timestamptz,

  foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);

create index device_commands_device_idx
  on public.device_commands (device_id, created_at desc);
create index device_commands_created_by_idx on public.device_commands (created_by);
create index device_commands_title_idx on public.device_commands (title_id, media_type);
-- Il ritiro dalla TV: "il piu' recente non ancora consegnato e non scaduto".
create index device_commands_da_consegnare_idx
  on public.device_commands (device_id, expires_at)
  where delivered_at is null;

alter table public.device_commands enable row level security;

-- Si vede e si scrive solo per una TV di cui si e' membro. La TV non passa di
-- qui: si autentica col token, come per lo scrobble, e legge col service role.
drop policy if exists device_commands_select_own on public.device_commands;
create policy device_commands_select_own on public.device_commands
  for select to authenticated
  using (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists device_commands_insert_own on public.device_commands;
create policy device_commands_insert_own on public.device_commands
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );
