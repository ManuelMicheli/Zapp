-- Distribuzione dei voti Zapp di un titolo (1..5) per la sezione recensioni.
-- Come title_rating_stats: SECURITY DEFINER perché le policy su watch_entries
-- mostrano solo le proprie entry e quelle degli amici, mentre qui servono numeri
-- aggregati su tutti gli utenti. Restituisce solo conteggi: nessun dato personale.
create or replace function public.title_rating_histogram(t_id bigint, t_type media_type)
returns table(rating smallint, n bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select rating, count(*)
  from public.watch_entries
  where title_id = t_id and media_type = t_type and rating is not null
  group by rating
  order by rating desc;
$$;

revoke all on function public.title_rating_histogram(bigint, media_type) from public, anon;
grant execute on function public.title_rating_histogram(bigint, media_type) to authenticated;
