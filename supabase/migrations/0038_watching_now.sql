-- Proiezione minima della sessione corrente. Nessun dato del dispositivo agli amici.
create table public.watching_now (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source_session_id uuid not null references public.watch_sessions(id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  provider_id int not null,
  season_number int,
  episode_number int,
  state text not null check (state in ('playing','paused','stopped')),
  position_ms bigint not null,
  duration_ms bigint,
  measured_at timestamptz not null,
  foreign key(title_id,media_type) references public.titles(id,media_type)
);
create index watching_now_source_idx on public.watching_now(source_session_id);
create index watching_now_title_idx on public.watching_now(title_id,media_type);
alter table public.watching_now enable row level security;
revoke all on public.watching_now from public, anon, authenticated;
grant select(user_id,title_id,media_type,provider_id,season_number,episode_number,
  state,position_ms,duration_ms,measured_at) on public.watching_now to authenticated;
grant all on public.watching_now to service_role;

create policy watching_now_read on public.watching_now for select to authenticated using (
  measured_at > now() - interval '90 seconds' and measured_at <= now()
  and state in ('playing','paused')
  and (user_id = (select auth.uid()) or (
    user_id in (select public.my_friend_ids())
    and not public.is_blocked((select auth.uid()), user_id)
    and exists (select 1 from public.watch_entries e
      where e.user_id = watching_now.user_id and e.title_id = watching_now.title_id
      and e.media_type = watching_now.media_type and not e.is_private)
  ))
);

create function public.sync_watching_now() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  -- Un dispositivo sospeso/revocato non riaccende una presenza.
  if not exists (select 1 from public.device_members m join public.devices d on d.id=m.device_id
    where m.device_id=new.device_id and m.user_id=new.user_id
    and (m.paused_until is null or m.paused_until<=now()) and d.revoked_at is null)
  then return new; end if;
  insert into public.watching_now as w
    (user_id,source_session_id,title_id,media_type,provider_id,season_number,episode_number,
     state,position_ms,duration_ms,measured_at)
  values (new.user_id,new.id,new.title_id,new.media_type,new.provider_id,new.season_number,new.episode_number,
    case when new.ended_at is not null then 'stopped' else new.state end,
    new.position_ms,new.duration_ms,new.last_heartbeat_at)
  on conflict(user_id) do update set
    source_session_id=excluded.source_session_id,title_id=excluded.title_id,media_type=excluded.media_type,
    provider_id=excluded.provider_id,season_number=excluded.season_number,episode_number=excluded.episode_number,
    state=excluded.state,position_ms=excluded.position_ms,duration_ms=excluded.duration_ms,measured_at=excluded.measured_at
  where excluded.measured_at>w.measured_at
     or (excluded.measured_at=w.measured_at and excluded.source_session_id=w.source_session_id);
  return new;
end;
$$;
revoke all on function public.sync_watching_now() from public,anon,authenticated;
create trigger sync_watching_now after insert or update on public.watch_sessions
for each row execute function public.sync_watching_now();

-- Revoca o pausa della condivisione: sparisce anche prima della scadenza naturale.
create function public.clear_watching_now() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='device_members' then
    delete from public.watching_now w using public.watch_sessions s
      where w.source_session_id=s.id and s.device_id=old.device_id and w.user_id=old.user_id;
  else
    delete from public.watching_now w using public.watch_sessions s
      where w.source_session_id=s.id and s.device_id=old.id;
  end if;
  return null;
end;
$$;
revoke all on function public.clear_watching_now() from public,anon,authenticated;
create trigger clear_watching_now_member after delete or update of paused_until on public.device_members
for each row execute function public.clear_watching_now();
create trigger clear_watching_now_device after update of revoked_at on public.devices
for each row when (new.revoked_at is not null) execute function public.clear_watching_now();

-- Avvio immediato senza aspettare il prossimo battito; nessuna scrittura nelle sessioni.
insert into public.watching_now
  (user_id,source_session_id,title_id,media_type,provider_id,season_number,episode_number,state,position_ms,duration_ms,measured_at)
select distinct on(s.user_id) s.user_id,s.id,s.title_id,s.media_type,s.provider_id,s.season_number,s.episode_number,
  case when s.ended_at is not null then 'stopped' else s.state end,s.position_ms,s.duration_ms,s.last_heartbeat_at
from public.watch_sessions s join public.devices d on d.id=s.device_id
join public.device_members m on m.device_id=s.device_id and m.user_id=s.user_id
where s.last_heartbeat_at>now()-interval '90 seconds' and s.last_heartbeat_at<=now()
  and d.revoked_at is null and (m.paused_until is null or m.paused_until<=now())
order by s.user_id,s.last_heartbeat_at desc,s.started_at desc;
