-- Zapp — migration 0003: social (amicizie, feed, consigli, recensioni, notifiche)

-- ============ friendships ============
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id, status);

create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

-- amici accettati in una delle due direzioni: usata da tutte le policy
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

-- blocco in una delle due direzioni: nasconde ricerca e profili
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'blocked'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
revoke execute on function public.are_friends(uuid, uuid) from anon;
revoke execute on function public.is_blocked(uuid, uuid) from anon;

alter table public.friendships enable row level security;

create policy "friendships_select_involved" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));
-- insert: solo come richiedente; 'pending' per richieste, 'blocked' per bloccare
create policy "friendships_insert_own" on public.friendships
  for insert with check (
    requester_id = auth.uid()
    and status in ('pending', 'blocked')
    and not public.is_blocked(requester_id, addressee_id)
  );
-- update: solo il destinatario, solo verso accepted/blocked
create policy "friendships_update_addressee" on public.friendships
  for update using (addressee_id = auth.uid())
  with check (status in ('accepted', 'blocked'));
create policy "friendships_delete_involved" on public.friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

-- ============ recommendations ============
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  message text check (char_length(message) <= 280),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

alter table public.recommendations enable row level security;

create policy "recommendations_select_involved" on public.recommendations
  for select using (auth.uid() in (from_user, to_user));
create policy "recommendations_insert_to_friend" on public.recommendations
  for insert with check (
    from_user = auth.uid() and public.are_friends(from_user, to_user)
  );
create policy "recommendations_update_seen" on public.recommendations
  for update using (to_user = auth.uid());
create policy "recommendations_delete_involved" on public.recommendations
  for delete using (auth.uid() in (from_user, to_user));

-- ============ reviews ============
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  body text not null check (char_length(body) between 1 and 5000),
  has_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index reviews_title_idx on public.reviews (title_id, media_type, created_at desc);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_own" on public.reviews
  for insert with check (user_id = auth.uid());
create policy "reviews_update_own" on public.reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews_delete_own" on public.reviews
  for delete using (user_id = auth.uid());

-- ============ review_comments (un solo livello di annidamento) ============
create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.review_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  has_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_comments_review_idx on public.review_comments (review_id, created_at);

create trigger review_comments_set_updated_at
  before update on public.review_comments
  for each row execute function public.set_updated_at();

-- vieta risposte a risposte (un livello solo)
create or replace function public.check_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.review_comments
      where id = new.parent_id and parent_id is not null
    ) then
      raise exception 'Un solo livello di risposta consentito';
    end if;
  end if;
  return new;
end;
$$;

create trigger review_comments_depth
  before insert on public.review_comments
  for each row execute function public.check_comment_depth();

alter table public.review_comments enable row level security;

create policy "review_comments_select_all" on public.review_comments
  for select using (true);
create policy "review_comments_insert_own" on public.review_comments
  for insert with check (user_id = auth.uid());
-- modifica solo entro 15 minuti
create policy "review_comments_update_own_15min" on public.review_comments
  for update using (
    user_id = auth.uid() and created_at > now() - interval '15 minutes'
  ) with check (user_id = auth.uid());
create policy "review_comments_delete_own" on public.review_comments
  for delete using (user_id = auth.uid());

-- ============ review_likes ============
create table public.review_likes (
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

alter table public.review_likes enable row level security;

create policy "review_likes_select_all" on public.review_likes
  for select using (true);
create policy "review_likes_insert_own" on public.review_likes
  for insert with check (user_id = auth.uid());
create policy "review_likes_delete_own" on public.review_likes
  for delete using (user_id = auth.uid());

-- ============ reports ============
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('review', 'comment')),
  target_id uuid not null,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

alter table public.reports enable row level security;

create policy "reports_insert_own" on public.reports
  for insert with check (reporter_id = auth.uid());
create policy "reports_select_own" on public.reports
  for select using (reporter_id = auth.uid());

-- conteggio segnalazioni per nascondere contenuti (3+ => nascosto in app)
create or replace function public.report_count(t_type text, t_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct reporter_id) from public.reports
  where target_type = t_type and target_id = t_id;
$$;
grant execute on function public.report_count(text, uuid) to authenticated;

-- ============ activities (popolate SOLO da trigger) ============
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (
    kind in ('started', 'finished', 'rated', 'reviewed', 'wanted', 'recommended')
  ),
  title_id bigint not null,
  media_type public.media_type not null,
  payload jsonb,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create index activities_user_idx on public.activities (user_id, created_at desc);

alter table public.activities enable row level security;

create policy "activities_select_own" on public.activities
  for select using (user_id = auth.uid());
create policy "activities_select_friends" on public.activities
  for select using (
    public.are_friends(auth.uid(), user_id) and not is_private
  );
-- nessuna policy di scrittura: scrivono solo i trigger (security definer)

-- trigger su watch_entries → activities
create or replace function public.log_watch_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- l'import di massa non deve inondare il feed
  if coalesce(current_setting('zapp.skip_activities', true), '') = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'want' then
      insert into activities (user_id, kind, title_id, media_type, is_private)
      values (new.user_id, 'wanted', new.title_id, new.media_type, new.is_private);
    elsif new.status = 'watching' then
      insert into activities (user_id, kind, title_id, media_type, payload, is_private)
      values (new.user_id, 'started', new.title_id, new.media_type,
              jsonb_strip_nulls(jsonb_build_object('season', new.season_number, 'episode', new.episode_number)),
              new.is_private);
    elsif new.status = 'watched' then
      insert into activities (user_id, kind, title_id, media_type, is_private)
      values (new.user_id, 'finished', new.title_id, new.media_type, new.is_private);
    end if;
    if new.rating is not null then
      insert into activities (user_id, kind, title_id, media_type, payload, is_private)
      values (new.user_id, 'rated', new.title_id, new.media_type,
              jsonb_build_object('rating', new.rating), new.is_private);
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status = 'watching' and (old.status <> 'watching'
      or new.season_number is distinct from old.season_number
      or new.episode_number is distinct from old.episode_number) then
    insert into activities (user_id, kind, title_id, media_type, payload, is_private)
    values (new.user_id, 'started', new.title_id, new.media_type,
            jsonb_strip_nulls(jsonb_build_object('season', new.season_number, 'episode', new.episode_number)),
            new.is_private);
  elsif new.status = 'watched' and old.status <> 'watched' then
    insert into activities (user_id, kind, title_id, media_type, is_private)
    values (new.user_id, 'finished', new.title_id, new.media_type, new.is_private);
  elsif new.status = 'want' and old.status <> 'want' then
    insert into activities (user_id, kind, title_id, media_type, is_private)
    values (new.user_id, 'wanted', new.title_id, new.media_type, new.is_private);
  end if;

  if new.rating is not null and new.rating is distinct from old.rating then
    insert into activities (user_id, kind, title_id, media_type, payload, is_private)
    values (new.user_id, 'rated', new.title_id, new.media_type,
            jsonb_build_object('rating', new.rating), new.is_private);
  end if;
  return new;
end;
$$;

create trigger watch_entries_activity
  after insert or update on public.watch_entries
  for each row execute function public.log_watch_activity();

-- trigger su reviews → activities
create or replace function public.log_review_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (user_id, kind, title_id, media_type, payload)
  values (new.user_id, 'reviewed', new.title_id, new.media_type,
          jsonb_build_object('review_id', new.id));
  return new;
end;
$$;

create trigger reviews_activity
  after insert on public.reviews
  for each row execute function public.log_review_activity();

-- trigger su recommendations → activities
create or replace function public.log_recommendation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (user_id, kind, title_id, media_type, payload)
  values (new.from_user, 'recommended', new.title_id, new.media_type,
          jsonb_build_object('to_user', new.to_user));
  return new;
end;
$$;

create trigger recommendations_activity
  after insert on public.recommendations
  for each row execute function public.log_recommendation_activity();

-- ============ notifications ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (
    kind in ('friend_request', 'friend_accepted', 'recommendation', 'comment')
  ),
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- scrittura solo dai trigger

create or replace function public.notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into notifications (user_id, kind, payload)
    values (new.addressee_id, 'friend_request',
            jsonb_build_object('from_user', new.requester_id));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    insert into notifications (user_id, kind, payload)
    values (new.requester_id, 'friend_accepted',
            jsonb_build_object('from_user', new.addressee_id));
  end if;
  return new;
end;
$$;

create trigger friendships_notify
  after insert or update on public.friendships
  for each row execute function public.notify_friendship();

create or replace function public.notify_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, kind, payload)
  values (new.to_user, 'recommendation',
          jsonb_build_object('from_user', new.from_user, 'title_id', new.title_id,
                             'media_type', new.media_type));
  return new;
end;
$$;

create trigger recommendations_notify
  after insert on public.recommendations
  for each row execute function public.notify_recommendation();

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_owner uuid;
begin
  select user_id into review_owner from public.reviews where id = new.review_id;
  if review_owner is not null and review_owner <> new.user_id then
    insert into notifications (user_id, kind, payload)
    values (review_owner, 'comment',
            jsonb_build_object('from_user', new.user_id, 'review_id', new.review_id));
  end if;
  return new;
end;
$$;

create trigger review_comments_notify
  after insert on public.review_comments
  for each row execute function public.notify_comment();

-- ============ policy aggiuntive su tabelle esistenti ============
-- amici leggono le entry non private (in aggiunta alla policy sul proprio)
create policy "watch_entries_select_friends" on public.watch_entries
  for select using (
    public.are_friends(auth.uid(), user_id) and not is_private
  );

-- profiles: i privati sono leggibili solo da sé e dagli amici; i bloccati mai
drop policy "profiles_select_all" on public.profiles;
create policy "profiles_select_visible" on public.profiles
  for select using (
    id = auth.uid()
    or (
      not public.is_blocked(auth.uid(), id)
      and (not is_private or public.are_friends(auth.uid(), id))
    )
  );

-- ricerca utenti: username e avatar restano visibili anche per i privati
-- (vista con diritti del proprietario, esclude i bloccati)
create or replace view public.user_search
with (security_invoker = false)
as
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.onboarding_completed_at is not null
    and not public.is_blocked(auth.uid(), p.id);

revoke all on public.user_search from anon, public;
grant select on public.user_search to authenticated;

-- ============ import senza attività (transazione unica con set local) ============
create or replace function public.import_watch_entries(entries jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  written int := 0;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  perform set_config('zapp.skip_activities', 'true', true); -- locale alla transazione

  for entry in select * from jsonb_array_elements(entries) loop
    insert into watch_entries (
      user_id, title_id, media_type, status, season_number, episode_number,
      started_at, finished_at, rating
    ) values (
      auth.uid(),
      (entry ->> 'title_id')::bigint,
      (entry ->> 'media_type')::media_type,
      (entry ->> 'status')::watch_status,
      (entry ->> 'season_number')::int,
      (entry ->> 'episode_number')::int,
      (entry ->> 'started_at')::timestamptz,
      (entry ->> 'finished_at')::timestamptz,
      (entry ->> 'rating')::smallint
    )
    on conflict (user_id, title_id, media_type) do update set
      status = excluded.status,
      season_number = excluded.season_number,
      episode_number = excluded.episode_number,
      started_at = coalesce(watch_entries.started_at, excluded.started_at),
      finished_at = excluded.finished_at
    where watch_entries.rating is null
      and watch_entries.status <> 'watched';
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

grant execute on function public.import_watch_entries(jsonb) to authenticated;
revoke execute on function public.import_watch_entries(jsonb) from anon;

-- hardening: le funzioni trigger non sono chiamabili via RPC
revoke execute on function public.log_watch_activity() from anon, authenticated, public;
revoke execute on function public.log_review_activity() from anon, authenticated, public;
revoke execute on function public.log_recommendation_activity() from anon, authenticated, public;
revoke execute on function public.notify_friendship() from anon, authenticated, public;
revoke execute on function public.notify_recommendation() from anon, authenticated, public;
revoke execute on function public.notify_comment() from anon, authenticated, public;
revoke execute on function public.check_comment_depth() from anon, authenticated, public;
