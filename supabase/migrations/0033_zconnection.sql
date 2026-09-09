-- ZConnection: dispositivi che riferiscono cosa l'utente sta guardando.
-- Nessuna policy per `anon`: la chiave anon sta nel bundle del browser.

create type public.device_platform as enum ('fire_tv', 'android_tv', 'android', 'browser_ext');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null unique,
  token_hash text not null unique,          -- sha256 esadecimale, mai il token
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.device_members (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

-- la PK (device_id, user_id) non copre la ricerca per solo user_id: la fanno
-- tutte e tre le policy sotto e la query "i miei dispositivi".
create index device_members_user_idx on public.device_members (user_id);

create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  provider_id int not null,
  title_id bigint not null,
  media_type public.media_type not null,
  season_number int,
  episode_number int,
  state text not null check (state in ('playing', 'paused', 'stopped')),
  position_ms bigint not null default 0,
  duration_ms bigint,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index watch_sessions_user_live_idx
  on public.watch_sessions (user_id, last_heartbeat_at desc)
  where ended_at is null;

create table public.pending_scrobbles (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('ambiguous_title', 'unknown_title', 'ambiguous_user')),
  provider_id int not null,
  raw jsonb not null,
  candidates jsonb not null default '[]',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index pending_scrobbles_open_key_idx
  on public.pending_scrobbles (device_id, provider_id, (raw ->> 'key'))
  where resolved_at is null;

alter table public.devices enable row level security;
alter table public.device_members enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.pending_scrobbles enable row level security;

create policy devices_select_members on public.devices for select to authenticated
  using (exists (select 1 from public.device_members m
                 where m.device_id = devices.id and m.user_id = (select auth.uid())));

create policy device_members_own on public.device_members for select to authenticated
  using (user_id = (select auth.uid()));
-- `with check` ripete la stessa condizione di proprieta', ma non basta da sola:
-- senza il grant per colonna sotto, un utente potrebbe riscrivere `device_id`
-- (o `user_id`) di una riga propria e diventare membro di un device altrui
-- senza invito (stessa classe di bug di `friendships_update_addressee`,
-- CLAUDE.md). L'unica colonna che l'utente deve poter scrivere e' `paused_until`.
create policy device_members_update_own on public.device_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy device_members_delete_own on public.device_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy watch_sessions_select_own on public.watch_sessions for select to authenticated
  using (user_id = (select auth.uid()));

create policy pending_select_own on public.pending_scrobbles for select to authenticated
  using (user_id = (select auth.uid())
         or (user_id is null
             and exists (select 1 from public.device_members m
                         where m.device_id = pending_scrobbles.device_id
                           and m.user_id = (select auth.uid()))));

revoke all on public.devices from anon;
revoke all on public.device_members from anon;
revoke all on public.watch_sessions from anon;
revoke all on public.pending_scrobbles from anon;

grant select on public.devices to authenticated;
grant select, delete on public.device_members to authenticated;
-- solo `paused_until` e' scrivibile: `device_id` e `user_id` non lo sono per
-- nessuna riga, quindi il `with check` sopra non deve (e non puo') difendersi
-- da un cambio di proprieta' scritto in quelle due colonne.
grant update (paused_until) on public.device_members to authenticated;
grant select on public.watch_sessions to authenticated;
grant select on public.pending_scrobbles to authenticated;
