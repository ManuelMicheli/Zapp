-- Mappatura profilo della piattaforma -> utente Zapp, e punto di ripresa.

create table public.device_profiles (
  device_id uuid not null references public.devices (id) on delete cascade,
  site text not null check (site in ('netflix', 'prime', 'disney', 'now')),
  profile_name text not null,
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, site, profile_name)
);

alter table public.device_profiles enable row level security;

-- `using`: chi puo' vedere/toccare la riga (membro del device). `with check`
-- aggiunge una seconda condizione sulla riga *scritta*: il `user_id` assegnato
-- dev'essere nullo (profilo non attribuito) oppure un altro membro dello
-- stesso device, mai un estraneo. Senza questa seconda meta', un membro
-- qualsiasi potrebbe dirottare un profilo Netflix/Prime/Disney/NOW verso un
-- `user_id` a piacere e le visioni di quel profilo finirebbero nella libreria
-- di un altro account.
create policy device_profiles_members on public.device_profiles for all to authenticated
  using (exists (select 1 from public.device_members m
                 where m.device_id = device_profiles.device_id
                   and m.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.device_members m
            where m.device_id = device_profiles.device_id
              and m.user_id = (select auth.uid()))
    and (
      device_profiles.user_id is null
      or exists (select 1 from public.device_members m2
                 where m2.device_id = device_profiles.device_id
                   and m2.user_id = device_profiles.user_id)
    )
  );

revoke all on public.device_profiles from anon;
grant select, insert, update, delete on public.device_profiles to authenticated;

-- Il punto di ripresa: dove sei adesso, distinto dall'ultimo episodio finito.
alter table public.watch_entries
  add column position_ms bigint,
  add column position_duration_ms bigint,
  add column position_season int,
  add column position_episode int,
  add column position_at timestamptz;

comment on column public.watch_entries.position_season is
  'Stagione a cui si riferisce position_ms: puo'' essere piu'' avanti di season_number, che e'' l''ultima stagione finita.';
comment on column public.watch_entries.position_episode is
  'Episodio a cui si riferisce position_ms: puo'' essere piu'' avanti di episode_number, che e'' l''ultimo finito.';
