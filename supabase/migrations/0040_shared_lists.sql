-- Liste personali/condivise e link-consiglio autenticati.
create table public.title_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 280),
  default_role text not null default 'viewer' check (default_role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.title_list_members (
  list_id uuid not null references public.title_lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.title_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.title_lists(id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (list_id, title_id, media_type),
  foreign key (title_id, media_type) references public.titles(id, media_type) on delete cascade
);

create table public.recommendation_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  sender_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  message text check (message is null or char_length(message) <= 280),
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (title_id, media_type) references public.titles(id, media_type) on delete cascade
);

create index title_lists_owner_idx on public.title_lists(owner_id, updated_at desc);
create index title_list_members_user_idx on public.title_list_members(user_id, created_at desc);
create index title_list_items_list_idx on public.title_list_items(list_id, created_at desc);
create index recommendation_links_sender_idx on public.recommendation_links(sender_id, created_at desc);
create index recommendation_links_expiry_idx on public.recommendation_links(expires_at);

create trigger title_lists_set_updated_at
before update on public.title_lists
for each row execute function public.set_updated_at();

create or replace function public.is_title_list_member(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.title_list_members
    where list_id = p_list_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_title_list_owner(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.title_lists
    where id = p_list_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_title_list(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.title_list_members
    where list_id = p_list_id and user_id = (select auth.uid()) and role in ('owner', 'editor')
  );
$$;

alter table public.title_lists enable row level security;
alter table public.title_list_members enable row level security;
alter table public.title_list_items enable row level security;
alter table public.recommendation_links enable row level security;

create policy title_lists_select_members on public.title_lists
for select to authenticated using (public.is_title_list_member(id));
create policy title_lists_insert_owner on public.title_lists
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy title_lists_update_owner on public.title_lists
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy title_lists_delete_owner on public.title_lists
for delete to authenticated using (owner_id = (select auth.uid()));

create policy title_list_members_select_members on public.title_list_members
for select to authenticated using (public.is_title_list_member(list_id));
create policy title_list_members_insert_owner on public.title_list_members
for insert to authenticated with check (public.is_title_list_owner(list_id));
create policy title_list_members_update_owner on public.title_list_members
for update to authenticated using (public.is_title_list_owner(list_id))
with check (public.is_title_list_owner(list_id) and role in ('owner', 'viewer', 'editor'));
create policy title_list_members_delete_owner_or_self on public.title_list_members
for delete to authenticated using (public.is_title_list_owner(list_id) or user_id = (select auth.uid()));

create policy title_list_items_select_members on public.title_list_items
for select to authenticated using (public.is_title_list_member(list_id));
create policy title_list_items_insert_editors on public.title_list_items
for insert to authenticated with check (public.can_edit_title_list(list_id) and added_by = (select auth.uid()));
create policy title_list_items_delete_editors on public.title_list_items
for delete to authenticated using (public.can_edit_title_list(list_id));

create policy recommendation_links_insert_sender on public.recommendation_links
for insert to authenticated with check (sender_id = (select auth.uid()));
create policy recommendation_links_select_sender on public.recommendation_links
for select to authenticated using (sender_id = (select auth.uid()));
create policy recommendation_links_delete_sender on public.recommendation_links
for delete to authenticated using (sender_id = (select auth.uid()));

-- Il destinatario consuma il token senza ottenere una lettura libera della tabella.
create or replace function public.consume_recommendation_link(p_token_hash text, p_accept boolean)
returns table (title_id bigint, media_type public.media_type)
language plpgsql security definer set search_path = '' as $$
declare
  link_row public.recommendation_links;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select * into link_row from public.recommendation_links
  where token_hash = p_token_hash and consumed_at is null and expires_at > now()
  for update;
  if not found then raise exception 'link unavailable'; end if;
  if not public.are_friends((select auth.uid()), link_row.sender_id) then
    raise exception 'link unavailable';
  end if;
  update public.recommendation_links
  set consumed_by = (select auth.uid()), consumed_at = now()
  where id = link_row.id;
  if p_accept then
    insert into public.recommendations (from_user, to_user, title_id, media_type, message)
    values (link_row.sender_id, (select auth.uid()), link_row.title_id, link_row.media_type, link_row.message)
    on conflict (from_user, to_user, title_id, media_type) do nothing;
  end if;
  return query select link_row.title_id, link_row.media_type;
end;
$$;

create or replace function public.preview_recommendation_link(p_token_hash text)
returns table (title_id bigint, media_type public.media_type, sender_id uuid, message text)
language plpgsql security definer set search_path = '' as $$
declare
  link_row public.recommendation_links;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select * into link_row from public.recommendation_links
  where token_hash = p_token_hash and consumed_at is null and expires_at > now();
  if not found or not public.are_friends((select auth.uid()), link_row.sender_id) then
    raise exception 'link unavailable';
  end if;
  return query select link_row.title_id, link_row.media_type, link_row.sender_id, link_row.message;
end;
$$;

revoke all on table public.title_lists, public.title_list_members, public.title_list_items, public.recommendation_links from anon;
revoke all on function public.is_title_list_member(uuid), public.is_title_list_owner(uuid), public.can_edit_title_list(uuid), public.consume_recommendation_link(text, boolean), public.preview_recommendation_link(text) from public, anon;
grant select, insert, update, delete on public.title_lists, public.title_list_members, public.title_list_items, public.recommendation_links to authenticated;
grant execute on function public.is_title_list_member(uuid), public.is_title_list_owner(uuid), public.can_edit_title_list(uuid), public.consume_recommendation_link(text, boolean), public.preview_recommendation_link(text) to authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
