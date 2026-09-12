-- Import multi-sorgente: Letterboxd, TV Time e file JSON/CSV.
--
-- Due cose. (1) Il registro degli import conosceva solo Netflix.
-- (2) La watchlist arriva come status 'want': la clausola `where` dell'upsert
-- aggiornava **sempre** un film (`media_type = 'movie'`), quindi una riga di
-- watchlist avrebbe riportato a "Da vedere" un film già visto. Il filtro fine
-- resta in `confirmImport` (ha già le righe esistenti in memoria); questa è la
-- rete di sicurezza lato DB.

alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source in ('netflix', 'letterboxd', 'tvtime', 'file'));

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
      started_at, finished_at, rating, last_watched_at
    ) values (
      auth.uid(),
      (entry ->> 'title_id')::bigint,
      (entry ->> 'media_type')::media_type,
      (entry ->> 'status')::watch_status,
      (entry ->> 'season_number')::int,
      (entry ->> 'episode_number')::int,
      (entry ->> 'started_at')::timestamptz,
      (entry ->> 'finished_at')::timestamptz,
      (entry ->> 'rating')::smallint,
      coalesce((entry ->> 'last_watched_at')::timestamptz, now())
    )
    on conflict (user_id, title_id, media_type) do update set
      status = excluded.status,
      season_number = excluded.season_number,
      episode_number = excluded.episode_number,
      started_at = coalesce(watch_entries.started_at, excluded.started_at),
      finished_at = excluded.finished_at,
      rating = coalesce(watch_entries.rating, excluded.rating),
      last_watched_at = greatest(watch_entries.last_watched_at, excluded.last_watched_at)
    where (watch_entries.media_type = 'movie'
        or coalesce(excluded.season_number, 0) > coalesce(watch_entries.season_number, 0)
        or (coalesce(excluded.season_number, 0) = coalesce(watch_entries.season_number, 0)
            and coalesce(excluded.episode_number, 0) >= coalesce(watch_entries.episode_number, 0)))
      and not (excluded.status = 'want'
               and watch_entries.status in ('watching', 'watched', 'dropped'));
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.import_watch_entries(jsonb) from public, anon;
grant execute on function public.import_watch_entries(jsonb) to authenticated;
