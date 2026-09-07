-- La funzione trigger notify_activity_like (migration 0016) era rimasta
-- eseguibile da anon e authenticated via /rest/v1/rpc/, unica fra le dieci
-- funzioni trigger del progetto: tutte le altre sono revocate dalla 0005 e
-- dalla 0001b. Postgres verifica EXECUTE alla creazione del trigger, non a
-- ogni scatto, quindi la revoca non tocca i like sulle attività.
revoke execute on function public.notify_activity_like() from anon, authenticated, public;
