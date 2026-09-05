-- Dieta dati per le liste (home, libreria, profilo): `titles.raw` pesa ~27 KB a riga
-- e le liste ne trasportavano centinaia. Le pagine leggono solo colonne esplicite;
-- il progresso serie usa `seasons` (pochi KB), colonna generata da `raw`.

alter table public.titles
  add column if not exists seasons jsonb
  generated always as (raw -> 'seasons') stored;

-- Statistiche profilo calcolate in SQL: film/serie visti, episodi, minuti, generi.
-- Stessa logica di src/lib/watch/episodes.ts: stagioni > 0, con episodi, già uscite.
create or replace function public.profile_stats(uid uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select w.id, w.status, w.media_type, w.season_number, w.episode_number,
           t.runtime, t.genres, t.seasons
    from public.watch_entries w
    join public.titles t on t.id = w.title_id and t.media_type = w.media_type
    where w.user_id = uid
  ),
  tv as (
    select e.id, e.runtime,
      coalesce(sum(
        case
          when e.status = 'watched' then ep.cnt
          when e.season_number is null or e.episode_number is null then 0
          when ep.num < e.season_number then ep.cnt
          when ep.num = e.season_number then least(e.episode_number, ep.cnt)
          else 0
        end), 0) as eps
    from e
    left join lateral (
      select (s->>'season_number')::int as num, (s->>'episode_count')::int as cnt
      from jsonb_array_elements(coalesce(e.seasons, '[]'::jsonb)) s
      where (s->>'season_number')::int > 0
        and coalesce((s->>'episode_count')::int, 0) > 0
        and nullif(s->>'air_date', '') is not null
        and (s->>'air_date')::date <= current_date
    ) ep on true
    where e.media_type = 'tv'
    group by e.id, e.runtime
  ),
  genres as (
    select g->>'name' as name, count(*) as cnt
    from e, jsonb_array_elements(coalesce(e.genres, '[]'::jsonb)) g
    where e.status = 'watched' and g->>'name' is not null
    group by 1
    order by 2 desc
    limit 5
  )
  select jsonb_build_object(
    'films_watched', (select count(*) from e where media_type = 'movie' and status = 'watched'),
    'series_watched', (select count(*) from e where media_type = 'tv' and status = 'watched'),
    'watched_total', (select count(*) from e where status = 'watched'),
    'episodes_seen', (select coalesce(sum(eps), 0) from tv),
    'minutes',
      (select coalesce(sum(runtime), 0) from e where media_type = 'movie' and status = 'watched')
      + (select coalesce(sum(eps * coalesce(runtime, 40)), 0) from tv),
    'top_genres', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt) order by cnt desc), '[]'::jsonb)
      from genres
    )
  );
$$;

revoke execute on function public.profile_stats(uuid) from anon, public;
grant execute on function public.profile_stats(uuid) to authenticated;
