-- Motore periodico della fase B. Non usiamo Vercel Cron: sul piano Hobby dà al massimo
-- due job, una volta al giorno, a orario non garantito.
--
-- Il segreto sta nel Vault come `zapp_jobs_secret`, creato il 2026-09-07 (64 caratteri),
-- e lo stesso valore è in `JOBS_SECRET` su Vercel (Production e Preview).

create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema extensions;

-- La coda dei voti, con le priorità della spec: prima i titoli che stanno in una
-- classifica corrente, poi quelli che qualcuno ha in libreria, poi tutti gli altri.
-- Dentro ogni fascia, il più vecchio per primo. I titoli che MDBList non conosce
-- (`mdblist_miss`) tornano in coda solo dopo 30 giorni.
create or replace function public.ratings_refresh_queue(want integer)
returns table (id bigint, media_type public.media_type)
language sql
stable
security definer
set search_path = public
as $$
  with in_charts as (
    select distinct c.title_id as id, c.media_type
    from public.title_charts c
    where c.title_id is not null
      and c.period > current_date - interval '21 days'
  ),
  in_library as (
    select distinct w.title_id as id, w.media_type
    from public.watch_entries w
  ),
  ranked as (
    select t.id,
           t.media_type,
           case
             when ic.id is not null then 0
             when il.id is not null then 1
             else 2
           end as priority,
           r.fetched_at,
           r.mdblist_miss
    from public.titles t
    left join in_charts  ic on ic.id = t.id and ic.media_type = t.media_type
    left join in_library il on il.id = t.id and il.media_type = t.media_type
    left join public.title_ratings r on r.title_id = t.id and r.media_type = t.media_type
  )
  select ranked.id, ranked.media_type
  from ranked
  where ranked.fetched_at is null
     or (ranked.mdblist_miss and ranked.fetched_at < now() - interval '30 days')
     or (not ranked.mdblist_miss
         and ranked.fetched_at < now() - (case when ranked.priority < 2
                                               then interval '7 days'
                                               else interval '30 days' end))
  order by ranked.priority, ranked.fetched_at nulls first
  limit greatest(1, want);
$$;

revoke all on function public.ratings_refresh_queue(integer) from public, anon, authenticated;

create or replace function public.call_zapp_job(job_name text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'zapp_jobs_secret';

  if secret is null then
    raise exception 'zapp_jobs_secret assente dal Vault';
  end if;

  return net.http_post(
    url := 'https://zapp-mu.vercel.app/api/jobs/' || job_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-jobs-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.call_zapp_job(text) from public, anon, authenticated;

-- Netflix pubblica il martedì: due tentativi, il secondo fa da rete di sicurezza.
select cron.schedule('zapp-charts-netflix', '0 4 * * 2,3',
  $$select public.call_zapp_job('charts-netflix')$$);

-- Ogni giorno: risolve i titoli nuovi e ricalcola il momentum.
select cron.schedule('zapp-charts-resolve', '30 5 * * *',
  $$select public.call_zapp_job('charts-resolve')$$);

-- Ogni ora: 5 lotti da 100 = 500 titoli, cioè 120 richieste al giorno sulle 10.000
-- del piano Supporter.
select cron.schedule('zapp-ratings-refresh', '0 * * * *',
  $$select public.call_zapp_job('ratings-refresh')$$);
