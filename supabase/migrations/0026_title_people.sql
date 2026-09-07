-- Fase C: regista e primi interpreti di un lotto di titoli, estratti **in SQL**.
--
-- `titles.raw` pesa ~27 KB per riga: leggerlo per duecento candidati vorrebbe dire
-- cinque megabyte sul filo a ogni render dello scaffale. Qui il JSON lo apre Postgres e
-- sul filo passano solo i nomi, che sono qualche decina di byte per titolo.
--
-- Volutamente **security invoker**: `titles` ha già la policy `titles_select_all` per
-- gli utenti autenticati, quindi non serve alzare i privilegi per leggerla.

create or replace function public.title_people(ids bigint[])
returns table (title_id bigint, media_type public.media_type, people text[])
language sql
stable
set search_path = public
as $fn$
  select t.id,
         t.media_type,
         coalesce(reg.nomi, '{}'::text[]) || coalesce(interpreti.nomi, '{}'::text[])
  from public.titles t
  left join lateral (
    select array_agg('Regia:' || (c->>'name')) as nomi
    from jsonb_array_elements(coalesce(t.raw->'credits'->'crew', '[]'::jsonb)) as c
    where c->>'job' = 'Director' and c->>'name' is not null
  ) reg on true
  left join lateral (
    select array_agg('Cast:' || (e.c->>'name') order by e.ord) as nomi
    from jsonb_array_elements(coalesce(t.raw->'credits'->'cast', '[]'::jsonb))
      with ordinality as e(c, ord)
    where e.ord <= 4 and e.c->>'name' is not null
  ) interpreti on true
  where t.id = any(ids);
$fn$;

revoke all on function public.title_people(bigint[]) from public, anon;
grant execute on function public.title_people(bigint[]) to authenticated, service_role;
