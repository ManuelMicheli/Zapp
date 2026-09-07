-- Coda dei titoli a cui manca il trailer, con le priorità: prima quelli che qualcuno ha
-- in libreria (sono le schede che si aprono davvero), poi il resto del catalogo, infine
-- le righe servite col ripiego inglese, che con una ricerca potrebbero diventare
-- italiane. Le righe ancora fresche non compaiono.
--
-- Serve al job orario `/api/jobs/trailers`, che ne prende poche per volta: il catalogo
-- si riempie da solo nel giro di qualche giorno senza sfondare la quota di YouTube.
create or replace function public.trailers_refresh_queue(want integer)
returns table (id integer, media_type public.media_type)
language sql
stable
security definer
set search_path to 'public'
as $$
  with in_library as (
    select distinct w.title_id as id, w.media_type from public.watch_entries w
  ),
  ranked as (
    select t.id,
           t.media_type,
           tt.checked_at,
           coalesce(tt.search_tries, 0) as search_tries,
           (tt.trailers -> 0 ->> 'lang') as lang,
           case
             when tt.title_id is null and il.id is not null then 0
             when tt.title_id is null then 1
             else 2
           end as priority
    from public.titles t
    left join public.title_trailers tt
      on tt.title_id = t.id
     and tt.media_type = t.media_type
     and tt.season_number = 0
    left join in_library il on il.id = t.id and il.media_type = t.media_type
  )
  select ranked.id, ranked.media_type
  from ranked
  where ranked.checked_at is null
     or (ranked.lang = 'en'
         and ranked.search_tries < 3
         and ranked.checked_at < now() - interval '7 days')
  order by ranked.priority, ranked.checked_at nulls first
  limit greatest(1, want);
$$;

comment on function public.trailers_refresh_queue(integer) is
  'Titoli senza trailer (o col ripiego inglese da riprovare), i più utili per primi.';

-- Come le altre funzioni di servizio: la chiama solo il service client dal job.
revoke all on function public.trailers_refresh_queue(integer) from public, anon, authenticated;

-- Un giro all'ora, sfasato dagli altri job (i voti girano al minuto 0).
-- Quindici titoli per giro coprono il catalogo in una decina di giorni.
select cron.schedule(
  'trailers',
  '20 * * * *',
  $$select public.call_zapp_job('trailers')$$
);
