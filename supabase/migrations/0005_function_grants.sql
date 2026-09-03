-- Zapp — migration 0005: revoca dei grant impliciti PUBLIC sulle funzioni RPC.
-- Restano eseguibili solo da `authenticated` (servono nelle policy RLS e nell'app).

revoke execute on function public.are_friends(uuid, uuid) from public, anon;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
revoke execute on function public.report_count(text, uuid) from public, anon;
revoke execute on function public.title_rating_stats(bigint, public.media_type) from public, anon;
revoke execute on function public.import_watch_entries(jsonb) from public, anon;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.report_count(text, uuid) to authenticated;
grant execute on function public.title_rating_stats(bigint, public.media_type) to authenticated;
grant execute on function public.import_watch_entries(jsonb) to authenticated;

-- default per le funzioni future: nessun EXECUTE automatico a PUBLIC
alter default privileges in schema public revoke execute on functions from public;
