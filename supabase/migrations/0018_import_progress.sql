-- Import Netflix: aggiornare le entry esistenti quando il CSV è più avanti.
--
-- Prima la RPC scriveva solo dove `rating is null and status <> 'watched'`:
-- una serie finita (o votata) non riceveva mai le stagioni nuove e l'import
-- "riconosceva ma non importava" (6425 righe → 0 scritte, 2026-09-06).
-- Ora il guard è solo sul progresso: mai un passo indietro, il voto dell'utente
-- resta suo (`coalesce`), lo stato segue il CSV (una serie finita che riparte
-- torna `watching`). Il filtro fine (film già visto, serie chiusa a mano senza
-- numero di stagione) è in `confirmNetflixImport`.

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
    where watch_entries.media_type = 'movie'
       or coalesce(excluded.season_number, 0) > coalesce(watch_entries.season_number, 0)
       or (coalesce(excluded.season_number, 0) = coalesce(watch_entries.season_number, 0)
           and coalesce(excluded.episode_number, 0) >= coalesce(watch_entries.episode_number, 0));
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.import_watch_entries(jsonb) from public, anon;
grant execute on function public.import_watch_entries(jsonb) to authenticated;
