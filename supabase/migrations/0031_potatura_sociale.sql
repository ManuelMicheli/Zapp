-- Quanto pesa il database, chiesto dal job notturno.
--
-- Il piano Free si ferma a 500 MB e il progetto va in sola lettura senza
-- preavviso: l'allarme deve arrivare prima. PostgREST non espone
-- pg_database_size, quindi serve una funzione, e la chiama solo il service
-- client.
create or replace function public.db_size_bytes()
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$ select pg_database_size(current_database()); $fn$;

revoke all on function public.db_size_bytes() from public, anon, authenticated;
grant execute on function public.db_size_bytes() to service_role;

-- I biglietti delle serate passate restavano nel bucket per sempre (1 GB di
-- piano). Job nuovo, alle 3:10, dopo events-prune.
--
-- Registrato via MCP sul progetto: la riga sotto e' per chi ricostruisce il
-- database da zero.
-- select cron.schedule('zapp-plans-prune', '10 3 * * *',
--                      $$select public.call_zapp_job('plans-prune')$$);
