-- Profilo di gusto aggregato e filtro di eleggibilita' per i suggerimenti di lista.
-- Le funzioni restituiscono solo dati di gruppo: mai righe o librerie dei membri.

create or replace function public.list_recommendation_profile(p_list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  result jsonb;
begin
  if (select auth.uid()) is null
     or not public.can_edit_title_list(p_list_id)
     or not exists (
       select 1
       from public.title_lists gated_list
       join public.title_list_members gated_member
         on gated_member.list_id = gated_list.id
        and gated_member.user_id = (select auth.uid())
       where gated_list.id = p_list_id
         and ((select auth.uid()) = gated_list.owner_id or gated_member.role = 'editor')
     ) then
    raise exception 'list unavailable';
  end if;

  with real_members as (
    select count(*)::integer as member_count
    from public.title_list_members m
    where m.list_id = p_list_id
  ),
  contributors as (
    select t.user_id, t.generi, t.decenni, t.provider, t.persone, t.tipo,
           t.runtime, t.lingua, t.massa
    from public.title_lists l
    join public.title_list_members m on m.list_id = l.id
    join public.user_taste t on t.user_id = m.user_id and t.massa > 0
    left join public.user_preferences p on p.user_id = m.user_id
    where l.id = p_list_id
      and (m.user_id = l.owner_id or m.role = 'editor')
      and coalesce(p.personalization_enabled, true)
  ),
  contributor_count as (
    select count(*)::integer as n from contributors
  ),
  entries as (
    select c.user_id, dimension.name as dimension, entry.key,
           entry.value::numeric as value
    from contributors c
    cross join lateral (
      values
        ('generi', c.generi), ('decenni', c.decenni),
        ('provider', c.provider), ('persone', c.persone),
        ('tipo', c.tipo), ('runtime', c.runtime), ('lingua', c.lingua)
    ) as dimension(name, values_json)
    cross join lateral jsonb_each(
      case when jsonb_typeof(dimension.values_json) = 'object'
           then dimension.values_json else '{}'::jsonb end
    ) as entry(key, value)
    where jsonb_typeof(entry.value) = 'number'
  ),
  with_maximum as (
    select user_id, dimension, key,
           value::text::numeric as value,
           max(abs(value::text::numeric)) over (partition by user_id, dimension) as max_abs
    from entries
  ),
  normalized as (
    select user_id, dimension, key, value / max_abs as value
    from with_maximum
    where max_abs > 0
  ),
  averaged as (
    -- Le chiavi assenti valgono zero: si divide per tutti i contributori, non solo
    -- per quelli che possiedono quella chiave. Cosi' ogni persona pesa uguale.
    select n.dimension, n.key, sum(n.value) / nullif(c.n, 0) as value
    from normalized n cross join contributor_count c
    group by n.dimension, n.key, c.n
  ),
  maps as (
    select dimension, jsonb_object_agg(key, value) as value
    from averaged
    group by dimension
  ),
  summary as (
    select
      coalesce(avg(least(1::numeric, greatest(0::numeric, c.massa::numeric / 60))), 0) as fiducia,
      coalesce(bool_and(c.massa >= 20), false) as abbastanza
    from contributors c
  )
  select jsonb_build_object(
    'vector', jsonb_build_object(
      'generi', coalesce((select value from maps where dimension = 'generi'), '{}'::jsonb),
      'decenni', coalesce((select value from maps where dimension = 'decenni'), '{}'::jsonb),
      'provider', coalesce((select value from maps where dimension = 'provider'), '{}'::jsonb),
      'persone', coalesce((select value from maps where dimension = 'persone'), '{}'::jsonb),
      'tipo', coalesce((select value from maps where dimension = 'tipo'), '{}'::jsonb),
      'runtime', coalesce((select value from maps where dimension = 'runtime'), '{}'::jsonb),
      'lingua', coalesce((select value from maps where dimension = 'lingua'), '{}'::jsonb)
    ),
    'fiducia', summary.fiducia,
    'abbastanza', summary.abbastanza,
    'contributorCount', contributor_count.n,
    'memberCount', real_members.member_count
  ) into result
  from summary cross join contributor_count cross join real_members;

  if result is null then raise exception 'list unavailable'; end if;
  return result;
end;
$fn$;

create or replace function public.list_recommendation_eligible(
  p_list_id uuid,
  p_candidates jsonb
)
returns table (title_id bigint, media_type public.media_type)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  list_owner uuid;
  member_count integer;
begin
  if (select auth.uid()) is null
     or not public.can_edit_title_list(p_list_id)
     or not exists (
       select 1
       from public.title_lists gated_list
       join public.title_list_members gated_member
         on gated_member.list_id = gated_list.id
        and gated_member.user_id = (select auth.uid())
       where gated_list.id = p_list_id
         and ((select auth.uid()) = gated_list.owner_id or gated_member.role = 'editor')
     ) then
    raise exception 'list unavailable';
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array'
     or jsonb_array_length(p_candidates) > 600 then
    raise exception 'invalid candidates';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_candidates) candidate
    where jsonb_typeof(candidate) <> 'object'
       or not (candidate ? 'id')
       or not (candidate ? 'mediaType')
       or jsonb_typeof(candidate->'id') <> 'number'
       or jsonb_typeof(candidate->'mediaType') <> 'string'
       or (candidate->>'id') !~ '^[1-9][0-9]*$'
       or (candidate->>'id')::numeric >= 10000000000
       or candidate->>'mediaType' not in ('movie', 'tv')
  ) then
    raise exception 'invalid candidates';
  end if;

  select l.owner_id, count(m.user_id)::integer
  into list_owner, member_count
  from public.title_lists l
  join public.title_list_members m on m.list_id = l.id
  where l.id = p_list_id
  group by l.owner_id;
  if list_owner is null then raise exception 'list unavailable'; end if;

  return query
  with requested as (
    select distinct (candidate->>'id')::bigint as title_id,
           (candidate->>'mediaType')::public.media_type as media_type
    from jsonb_array_elements(p_candidates) candidate
  )
  select requested.title_id, requested.media_type
  from requested
  where not exists (
    select 1 from public.title_list_items item
    where item.list_id = p_list_id
      and item.title_id = requested.title_id
      and item.media_type = requested.media_type
  )
  and not exists (
    select 1
    from public.watch_entries watched
    where watched.title_id = requested.title_id
      and watched.media_type = requested.media_type
      and (
        (member_count = 1 and watched.user_id = list_owner)
        or
        (member_count > 1
         and watched.status in ('watched', 'watching', 'dropped')
         and exists (
           select 1
           from public.title_list_members member
           join public.title_lists list_row on list_row.id = member.list_id
           where member.list_id = p_list_id
             and member.user_id = watched.user_id
             and (member.user_id = list_row.owner_id or member.role = 'editor')
         ))
      )
  );
end;
$fn$;

revoke all on function public.list_recommendation_profile(uuid) from public, anon;
revoke all on function public.list_recommendation_eligible(uuid, jsonb) from public, anon;
grant execute on function public.list_recommendation_profile(uuid) to authenticated;
grant execute on function public.list_recommendation_eligible(uuid, jsonb) to authenticated;
