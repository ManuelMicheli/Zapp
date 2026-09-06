-- "Continua a guardare" (home) e "Sto guardando"/"Visti" (libreria) in ordine
-- cronologico reale. `updated_at` non basta: l'import Netflix scrive a blocchi
-- (ogni RPC ha lo stesso now()), quindi l'ordine era quello dei chunk, non quello
-- delle date del CSV. `last_watched_at` = ultima visione effettiva: data del CSV
-- per l'import, momento dell'azione (Inizia, +1 episodio, Finito) per l'uso normale.

alter table public.watch_entries
  add column if not exists last_watched_at timestamptz;

-- backfill: visto → data di fine; import (started_at ben prima della creazione
-- della riga) → data del CSV salvata in started_at; altrimenti ultimo aggiornamento
update public.watch_entries
set last_watched_at = case
  when finished_at is not null then finished_at
  when started_at is not null and started_at < created_at - interval '1 day' then started_at
  else updated_at
end
where last_watched_at is null;

alter table public.watch_entries
  alter column last_watched_at set not null,
  alter column last_watched_at set default now();

create index if not exists watch_entries_user_status_last_watched_idx
  on public.watch_entries (user_id, status, last_watched_at desc);

-- l'import porta la data del CSV; su conflitto resta la visione più recente
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
      last_watched_at = greatest(watch_entries.last_watched_at, excluded.last_watched_at)
    where watch_entries.rating is null
      and watch_entries.status <> 'watched';
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.import_watch_entries(jsonb) from public, anon;
grant execute on function public.import_watch_entries(jsonb) to authenticated;
