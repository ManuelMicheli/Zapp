-- Zapp — migration 0004: helper per recensioni e voti aggregati
-- (necessari perché RLS impedisce aggregati cross-utente su watch_entries
--  e la lettura dei conteggi di segnalazione altrui)

-- media voti Zapp per un titolo (solo aggregato: nessun dato individuale)
create or replace function public.title_rating_stats(t_id bigint, t_type public.media_type)
returns table (avg_rating numeric, rating_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select round(avg(rating)::numeric, 1), count(*)
  from public.watch_entries
  where title_id = t_id and media_type = t_type and rating is not null;
$$;

grant execute on function public.title_rating_stats(bigint, public.media_type) to authenticated;
revoke execute on function public.title_rating_stats(bigint, public.media_type) from anon;

-- vista recensioni con conteggi (like, commenti, segnalazioni distinte)
create or replace view public.reviews_with_counts
with (security_invoker = false)
as
  select
    r.*,
    (select count(*) from public.review_likes l where l.review_id = r.id) as like_count,
    (select count(*) from public.review_comments c where c.review_id = r.id) as comment_count,
    (select count(distinct rp.reporter_id) from public.reports rp
      where rp.target_type = 'review' and rp.target_id = r.id) as report_count
  from public.reviews r;

revoke all on public.reviews_with_counts from anon, public;
grant select on public.reviews_with_counts to authenticated;
