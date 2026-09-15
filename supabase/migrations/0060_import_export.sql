-- Zapp — migration 0060: sorgente di import "export" (Apple, Disney+, NOW, Prime)
-- e bucket privato per i file caricati, che non passano piu' dal corpo della
-- Server Action (un export vero supera i 5 MB, e da telefono non si puo'
-- chiedere all'utente di aprire uno zip).

alter table public.imports drop constraint if exists imports_source_check;
alter table public.imports add constraint imports_source_check
  check (source in ('netflix', 'letterboxd', 'tvtime', 'file', 'export'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-uploads', 'import-uploads', false, 104857600,
  array[
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
    'text/csv', 'text/plain', 'application/json', 'text/tab-separated-values'
  ]
)
on conflict (id) do nothing;

drop policy if exists "import_uploads_select_own" on storage.objects;
drop policy if exists "import_uploads_insert_own" on storage.objects;
drop policy if exists "import_uploads_update_own" on storage.objects;
drop policy if exists "import_uploads_delete_own" on storage.objects;

create policy "import_uploads_select_own" on storage.objects
  for select using (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "import_uploads_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "import_uploads_update_own" on storage.objects
  for update using (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "import_uploads_delete_own" on storage.objects
  for delete using (
    bucket_id = 'import-uploads' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Il debito lasciato dalla 0043: la RPC gia' accetta lo stato 'watching' (lo
-- casta a watch_status), ma il suo unico guard blocca solo la degradazione a
-- 'want'. Per un film la clausola di progresso appena sopra e' sempre vera
-- (media_type = 'movie'), quindi senza questo guard una riga parziale
-- importata *dopo* una completa (l'ordine di un export non e' garantito, e un
-- secondo import puo' arrivare mesi dopo) farebbe retrocedere a "in corso" un
-- film gia' "visto". Solo per i film: per le serie una riga 'watching' su una
-- stagione piu' avanti e' un progresso legittimo (chi ha finito la stagione 1
-- ed e' alla 2 e' "in corso"), ed e' gia' filtrata dalla clausola di progresso
-- sopra. Corpo copiato pari pari dalla 0043, a parte questa aggiunta.
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
               and watch_entries.status in ('watching', 'watched', 'dropped'))
      and not (excluded.status = 'watching'
               and watch_entries.status = 'watched'
               and watch_entries.media_type = 'movie');
    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.import_watch_entries(jsonb) from public, anon;
grant execute on function public.import_watch_entries(jsonb) to authenticated;

-- Nota: `on conflict (id) do nothing` sul bucket e i `drop policy if exists`
-- sopra sono quelli applicati davvero al database: senza, chi ricostruisce il
-- DB da questa cartella trova una migration che al secondo giro fallisce
-- ("bucket already exists", "policy already exists").
--
-- Nota: applicata al database il 2026-09-15 quando ancora si chiamava
-- `0059_import_export` (la storia remota e' a timestamp, quindi il numero nel
-- nome non e' una chiave e non c'e' stato nessun conflitto). Rinumerata a 0060
-- perche' un'altra sessione ha pubblicato la sua `0059_chart_periodi_correnti`
-- su main nel frattempo: nel repo due file 0059_ confondono, sul DB no.
