-- Percorso cinefilo: conteggi correnti sotto RLS e riconoscimento verificato.

create type public.profile_verified_role as enum (
  'critic',
  'director',
  'actor',
  'public_figure'
);

alter table public.profiles
  add column verified_at timestamptz,
  add column verified_role public.profile_verified_role,
  add constraint profiles_verified_role_requires_verification
    check (verified_role is null or verified_at is not null);

-- Anche un payload INSERT/UPSERT costruito a mano non puo' assegnare la verifica.
-- Il trigger handle_new_user continua a inserire come proprietario della funzione.
revoke insert on public.profiles from authenticated;
grant insert (id, username, display_name, avatar_url, is_private, onboarding_completed_at)
  on public.profiles to authenticated;

-- Ripete l'allowlist esistente escludendo esplicitamente le nuove colonne protette.
revoke update on public.profiles from authenticated;
revoke update (verified_at, verified_role) on public.profiles from authenticated;
grant update (username, display_name, avatar_url, is_private, onboarding_completed_at)
  on public.profiles to authenticated;

create or replace function public.profile_progression(uid uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select case
    when (select auth.uid()) is null then null
    -- La SELECT su profiles mantiene anche blocchi e privacy sotto la RLS esistente.
    when not exists (
      select 1 from public.profiles p where p.id = uid
    ) then null
    -- Un profilo pubblico non rende pubblica la libreria: fuori dall'amicizia il
    -- risultato deve essere assente, non quattro zeri mescolati a review pubbliche.
    when uid <> (select auth.uid())
      and not exists (
        select 1
        from public.my_friend_ids() as friends(friend_id)
        where friends.friend_id = uid
      ) then null
    else (
      select jsonb_build_object(
        'films', watched.films,
        'series', watched.series,
        'ratings', watched.ratings,
        'reviews', eligible_reviews.reviews
      )
      from (
        select
          count(*) filter (
            where w.status = 'watched'::public.watch_status
              and w.media_type = 'movie'::public.media_type
          ) as films,
          count(*) filter (
            where w.status = 'watched'::public.watch_status
              and w.media_type = 'tv'::public.media_type
          ) as series,
          count(*) filter (where w.rating is not null) as ratings
        from public.watch_entries w
        where w.user_id = uid
      ) watched
      cross join (
        select count(*) as reviews
        from public.reviews r
        where r.user_id = uid
          and r.report_count < 3
          and char_length(
            regexp_replace(r.body, '^[[:space:]]+|[[:space:]]+$', '', 'g')
          ) >= 80
      ) eligible_reviews
    )
  end;
$fn$;

revoke all on function public.profile_progression(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.profile_progression(uuid) to authenticated;
