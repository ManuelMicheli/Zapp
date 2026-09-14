-- Eseguire dopo 0056_list_suggestions.sql. Tutte le fixture vengono annullate.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('a1100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'list-check-owner@example.invalid', '', now(), now(), now()),
  ('a1100002-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'list-check-editor@example.invalid', '', now(), now(), now()),
  ('a1100003-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'list-check-viewer@example.invalid', '', now(), now(), now()),
  ('a1100004-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'list-check-optout@example.invalid', '', now(), now(), now()),
  ('a1100005-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'list-check-outsider@example.invalid', '', now(), now(), now());

insert into public.user_taste (
  user_id, generi, decenni, provider, persone, tipo, runtime, lingua, massa
) values
  ('a1100000-0000-4000-8000-000000000001', '{"18":2,"35":1}', '{}', '{}', '{}', '{"movie":2}', '{"zero":0}', '{"it":"bad","en":2}', 60),
  ('a1100002-0000-4000-8000-000000000002', '{"18":-4,"35":4}', '{}', '{}', '{}', '{"tv":3}', '{"zero":0}', '{}', 30),
  ('a1100003-0000-4000-8000-000000000003', '{"99":9}', '{}', '{}', '{}', '{}', '{}', '{}', 60),
  ('a1100004-0000-4000-8000-000000000004', '{"12":9}', '{}', '{}', '{}', '{}', '{}', '{}', 60);
insert into public.user_preferences (user_id, personalization_enabled)
values ('a1100004-0000-4000-8000-000000000004', false);

insert into public.title_lists (id, owner_id, name)
values
  ('a1100000-0000-4000-8000-000000000011', 'a1100000-0000-4000-8000-000000000001', 'Personale test'),
  ('a1100000-0000-4000-8000-000000000012', 'a1100000-0000-4000-8000-000000000001', 'Condivisa test'),
  ('a1100000-0000-4000-8000-000000000013', 'a1100004-0000-4000-8000-000000000004', 'Solo opt-out test'),
  ('a1100000-0000-4000-8000-000000000014', 'a1100005-0000-4000-8000-000000000005', 'Profilo assente test');
insert into public.title_list_members (list_id, user_id, role) values
  ('a1100000-0000-4000-8000-000000000011', 'a1100000-0000-4000-8000-000000000001', 'owner'),
  ('a1100000-0000-4000-8000-000000000012', 'a1100000-0000-4000-8000-000000000001', 'owner'),
  ('a1100000-0000-4000-8000-000000000012', 'a1100002-0000-4000-8000-000000000002', 'editor'),
  ('a1100000-0000-4000-8000-000000000012', 'a1100003-0000-4000-8000-000000000003', 'viewer'),
  ('a1100000-0000-4000-8000-000000000012', 'a1100004-0000-4000-8000-000000000004', 'editor'),
  ('a1100000-0000-4000-8000-000000000013', 'a1100004-0000-4000-8000-000000000004', 'owner'),
  ('a1100000-0000-4000-8000-000000000014', 'a1100005-0000-4000-8000-000000000005', 'owner');

insert into public.titles (id, media_type, title) values
  (9900000001, 'movie', 'Fixture A film'), (9900000001, 'tv', 'Fixture A serie'),
  (9900000002, 'movie', 'Fixture B film'), (9900000002, 'tv', 'Fixture B serie'),
  (9900000003, 'movie', 'Fixture C film'), (9900000003, 'tv', 'Fixture C serie');
insert into public.title_list_items (list_id, title_id, media_type, added_by)
values ('a1100000-0000-4000-8000-000000000012', 9900000001, 'movie', 'a1100000-0000-4000-8000-000000000001');
insert into public.watch_entries (user_id, title_id, media_type, status) values
  ('a1100002-0000-4000-8000-000000000002', 9900000002, 'movie', 'watched'),
  ('a1100002-0000-4000-8000-000000000002', 9900000002, 'tv', 'want'),
  ('a1100003-0000-4000-8000-000000000003', 9900000003, 'movie', 'watched'),
  ('a1100000-0000-4000-8000-000000000001', 9900000003, 'tv', 'dropped');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1100000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $check_profile$
declare
  personal jsonb;
  shared jsonb;
begin
  personal := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000011');
  if (personal #>> '{vector,generi,18}')::numeric is distinct from 1
     or (personal #>> '{vector,generi,35}')::numeric is distinct from 0.5 then
    raise exception 'single profile parity failed: %', personal;
  end if;
  if personal #> '{vector,runtime}' is distinct from '{}'::jsonb then
    raise exception 'all-zero dimension was not removed: %', personal;
  end if;
  if (personal #>> '{vector,lingua,en}')::numeric is distinct from 1 or personal #> '{vector,lingua,it}' is not null then
    raise exception 'malformed dimension values were not ignored: %', personal;
  end if;

  shared := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  if (shared->>'contributorCount')::integer is distinct from 2
     or (shared->>'memberCount')::integer is distinct from 4 then
    raise exception 'role/opt-out counts failed: %', shared;
  end if;
  if (shared #>> '{vector,generi,18}')::numeric is distinct from 0
     or (shared #>> '{vector,generi,35}')::numeric is distinct from 0.75 then
    raise exception 'equal-weight opposing profile average failed: %', shared;
  end if;
  if (shared->>'fiducia')::numeric is distinct from 0.75
     or (shared->>'abbastanza')::boolean is not true then
    raise exception 'confidence aggregation failed: %', shared;
  end if;
end;
$check_profile$;

do $check_eligibility$
declare
  allowed jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', e.title_id, 'mediaType', e.media_type)), '[]'::jsonb)
  into allowed
  from public.list_recommendation_eligible(
    'a1100000-0000-4000-8000-000000000012',
    '[{"id":9900000001,"mediaType":"movie"},{"id":9900000001,"mediaType":"tv"},{"id":9900000002,"mediaType":"movie"},{"id":9900000002,"mediaType":"tv"},{"id":9900000003,"mediaType":"movie"},{"id":9900000003,"mediaType":"tv"}]'::jsonb
  ) e;
  if jsonb_array_length(allowed) is distinct from 3
     or not allowed @> '[{"id":9900000001,"mediaType":"tv"}]'::jsonb
     or not allowed @> '[{"id":9900000002,"mediaType":"tv"}]'::jsonb
     or not allowed @> '[{"id":9900000003,"mediaType":"movie"}]'::jsonb then
    raise exception 'shared eligibility failed: %', allowed;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.title_id, 'mediaType', e.media_type)), '[]'::jsonb)
  into allowed
  from public.list_recommendation_eligible(
    'a1100000-0000-4000-8000-000000000011',
    '[{"id":9900000002,"mediaType":"tv"},{"id":9900000003,"mediaType":"tv"}]'::jsonb
  ) e;
  if jsonb_array_length(allowed) is distinct from 1
     or not allowed @> '[{"id":9900000002,"mediaType":"tv"}]'::jsonb then
    raise exception 'personal eligibility failed: %', allowed;
  end if;
end;
$check_eligibility$;

-- Owner ed editor vedono lo stesso identico JSON aggregato.
do $check_same_profile$
declare
  owner_profile jsonb;
  editor_profile jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'a1100000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  owner_profile := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  perform set_config('request.jwt.claims', json_build_object('sub', 'a1100002-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
  editor_profile := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  if owner_profile is distinct from editor_profile then
    raise exception 'profile depends on requesting editor: owner %, editor %', owner_profile, editor_profile;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', 'a1100000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
end;
$check_same_profile$;

-- Viewer, outsider e sessione nulla devono ricevere un errore indistinguibile.
do $check_denied$
declare
  subject uuid;
  denied boolean;
begin
  foreach subject in array array[
    'a1100003-0000-4000-8000-000000000003'::uuid,
    'a1100005-0000-4000-8000-000000000005'::uuid
  ] loop
    perform set_config('request.jwt.claims', json_build_object('sub', subject, 'role', 'authenticated')::text, true);
    denied := false;
    begin
      perform public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
    exception when others then denied := true;
    end;
    if not denied then raise exception 'unauthorized subject accepted: %', subject; end if;
    denied := false;
    begin
      perform * from public.list_recommendation_eligible(
        'a1100000-0000-4000-8000-000000000012',
        '[{"id":9900000001,"mediaType":"tv"}]'::jsonb
      );
    exception when others then denied := true;
    end;
    if not denied then raise exception 'unauthorized subject eligible accepted: %', subject; end if;
  end loop;
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  denied := false;
  begin
    perform public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'null auth accepted'; end if;
  denied := false;
  begin
    perform * from public.list_recommendation_eligible(
      'a1100000-0000-4000-8000-000000000012',
      '[{"id":9900000001,"mediaType":"tv"}]'::jsonb
    );
  exception when others then denied := true;
  end;
  if not denied then raise exception 'null auth eligible accepted'; end if;
end;
$check_denied$;

reset role;

-- Opt-out totale e profilo assente producono lo stesso ripiego neutro, senza errori.
select set_config('request.jwt.claims', json_build_object('sub', 'a1100004-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
do $check_empty_profiles$
declare
  empty_profile jsonb;
begin
  empty_profile := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000013');
  if (empty_profile->>'contributorCount')::integer is distinct from 0
     or (empty_profile->>'fiducia')::numeric is distinct from 0
     or empty_profile #> '{vector}' is distinct from '{"generi":{},"decenni":{},"provider":{},"persone":{},"tipo":{},"runtime":{},"lingua":{}}'::jsonb then
    raise exception 'all-opt-out fallback failed: %', empty_profile;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', 'a1100005-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);
  empty_profile := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000014');
  if (empty_profile->>'contributorCount')::integer is distinct from 0
     or (empty_profile->>'fiducia')::numeric is distinct from 0
     or (empty_profile->>'abbastanza')::boolean is distinct from false then
    raise exception 'missing-taste fallback failed: %', empty_profile;
  end if;
end;
$check_empty_profiles$;
reset role;

-- Il permesso viene riletto: dopo la demozione lo stesso utente non passa piu'.
update public.title_list_members set role = 'viewer'
where list_id = 'a1100000-0000-4000-8000-000000000012'
  and user_id = 'a1100002-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', json_build_object('sub', 'a1100000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
do $check_demotion$
declare
  owner_profile jsonb;
  denied boolean := false;
begin
  owner_profile := public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  if (owner_profile->>'contributorCount')::integer is distinct from 1
     or (owner_profile #>> '{vector,generi,18}')::numeric is distinct from 1
     or (owner_profile #>> '{vector,generi,35}')::numeric is distinct from 0.5 then
    raise exception 'owner profile after demotion failed: %', owner_profile;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', 'a1100002-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
  begin
    perform public.list_recommendation_profile('a1100000-0000-4000-8000-000000000012');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'demoted editor accepted'; end if;
end;
$check_demotion$;
reset role;
rollback;
