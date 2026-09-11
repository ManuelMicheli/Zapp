-- Una visione condivisa non e' attribuibile a una persona: niente live agli amici.
alter table public.watching_now add column authorized_until timestamptz;
create or replace function public.sync_watching_now() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  -- Un dispositivo sospeso/revocato non riaccende una presenza.
  if (select count(*) from public.device_members m where m.device_id=new.device_id
      and (m.paused_until is null or m.paused_until<=now()))<>1
    or not exists (select 1 from public.device_members m join public.devices d on d.id=m.device_id
      where m.device_id=new.device_id and m.user_id=new.user_id
      and (m.paused_until is null or m.paused_until<=now()) and d.revoked_at is null)
  then
    delete from public.watching_now where source_session_id=new.id;
    return new;
  end if;
  insert into public.watching_now as w
    (user_id,source_session_id,title_id,media_type,provider_id,season_number,episode_number,
     state,position_ms,duration_ms,measured_at,authorized_until)
  values (new.user_id,new.id,new.title_id,new.media_type,new.provider_id,new.season_number,new.episode_number,
    case when new.ended_at is not null then 'stopped' else new.state end,
    new.position_ms,new.duration_ms,new.last_heartbeat_at,
    (select min(m.paused_until) from public.device_members m where m.device_id=new.device_id and m.user_id<>new.user_id and m.paused_until>now()))
  on conflict(user_id) do update set
    source_session_id=excluded.source_session_id,title_id=excluded.title_id,media_type=excluded.media_type,
    provider_id=excluded.provider_id,season_number=excluded.season_number,episode_number=excluded.episode_number,
    state=excluded.state,position_ms=excluded.position_ms,duration_ms=excluded.duration_ms,measured_at=excluded.measured_at,authorized_until=excluded.authorized_until
  where excluded.measured_at>w.measured_at
     or (excluded.measured_at=w.measured_at and excluded.source_session_id=w.source_session_id);
  return new;
end;
$$;
revoke all on function public.sync_watching_now() from public,anon,authenticated;

create or replace function public.clear_watching_now() returns trigger
language plpgsql security definer set search_path = '' as $$
declare device uuid;
begin
  if tg_table_name='device_members' then
    device := case when tg_op='INSERT' then new.device_id else old.device_id end;
  else device := old.id;
  end if;
  delete from public.watching_now w using public.watch_sessions s
    where w.source_session_id=s.id and s.device_id=device;
  return null;
end;
$$;
revoke all on function public.clear_watching_now() from public,anon,authenticated;
drop trigger clear_watching_now_member on public.device_members;
create trigger clear_watching_now_member after insert or delete or update of paused_until on public.device_members
for each row execute function public.clear_watching_now();

-- Le sospensioni temporanee possono scadere senza alcuna scrittura.
alter policy watching_now_read on public.watching_now using (
  (authorized_until is null or authorized_until>now()) and
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


update public.watching_now w set authorized_until=(
  select min(m.paused_until) from public.watch_sessions s join public.device_members m on m.device_id=s.device_id
  where s.id=w.source_session_id and m.user_id<>w.user_id and m.paused_until>now()
);
delete from public.watching_now w using public.watch_sessions s
where s.id=w.source_session_id and (select count(*) from public.device_members m
  where m.device_id=s.device_id and (m.paused_until is null or m.paused_until<=now()))<>1;
