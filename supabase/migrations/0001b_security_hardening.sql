-- Hardening: search_path fisso e revoca EXECUTE sulle funzioni interne.
-- Applicata al progetto il 2026-09-03 (versione DB 20260903152121); il file
-- mancava dal repo, quindi `supabase db push` su un progetto nuovo non
-- riproduceva lo schema di produzione.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
