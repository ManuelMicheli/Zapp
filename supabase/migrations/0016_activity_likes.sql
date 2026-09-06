-- Zapp — migration 0016: "mi piace" sulle attività del feed amici

create table public.activity_likes (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index activity_likes_activity_idx on public.activity_likes (activity_id);

-- attività visibile: la propria, o quella non privata di un amico (stessa regola
-- delle policy su activities). SECURITY DEFINER perché legge activities.
create or replace function public.can_see_activity(a_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.activities a
    where a.id = a_id
      and (
        a.user_id = auth.uid()
        or (public.are_friends(auth.uid(), a.user_id) and not a.is_private)
      )
  );
$$;

grant execute on function public.can_see_activity(uuid) to authenticated;
revoke execute on function public.can_see_activity(uuid) from anon;
revoke execute on function public.can_see_activity(uuid) from public;

alter table public.activity_likes enable row level security;

create policy "activity_likes_select_visible" on public.activity_likes
  for select using (public.can_see_activity(activity_id));
create policy "activity_likes_insert_own" on public.activity_likes
  for insert with check (
    user_id = auth.uid() and public.can_see_activity(activity_id)
  );
create policy "activity_likes_delete_own" on public.activity_likes
  for delete using (user_id = auth.uid());

-- ============ notifica "like" ============
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'friend_accepted', 'recommendation', 'comment', 'like'));

create or replace function public.notify_activity_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act public.activities%rowtype;
begin
  select * into act from public.activities where id = new.activity_id;
  if act.id is null or act.user_id = new.user_id then
    return new;
  end if;
  insert into notifications (user_id, kind, payload)
  values (
    act.user_id,
    'like',
    jsonb_build_object(
      'from_user', new.user_id,
      'title_id', act.title_id,
      'media_type', act.media_type,
      'activity_id', act.id
    )
  );
  return new;
end;
$$;

create trigger activity_likes_notify
  after insert on public.activity_likes
  for each row execute function public.notify_activity_like();
