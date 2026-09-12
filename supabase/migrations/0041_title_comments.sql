create table public.title_comments (
  id uuid primary key default gen_random_uuid(),
  title_id bigint not null,
  media_type text not null check (media_type in ('movie','tv')),
  season_number integer,
  episode_number integer,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  has_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  constraint title_comments_episode_pair check ((season_number is null and episode_number is null) or (season_number >= 0 and episode_number >= 1))
);
create index title_comments_lookup on public.title_comments(title_id, media_type, season_number, episode_number, created_at desc);
alter table public.title_comments enable row level security;
create policy title_comments_select on public.title_comments for select to authenticated using (not is_blocked(auth.uid(), user_id));
create policy title_comments_insert on public.title_comments for insert to authenticated with check (user_id = auth.uid());
create policy title_comments_delete on public.title_comments for delete to authenticated using (user_id = auth.uid());
revoke all on public.title_comments from anon;
grant select, insert, delete on public.title_comments to authenticated;
