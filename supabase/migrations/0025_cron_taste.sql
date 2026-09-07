-- I due job della fase A. `call_zapp_job` e il segreto nel Vault esistono dalla 0021.

-- Ogni ora al minuto 40. Il lucchetto di `job_runs` è per nome del job, non globale,
-- quindi due job diversi non si bloccherebbero a vicenda — ma si contenderebbero la
-- stessa finestra di 60 secondi della funzione Vercel. Al minuto 0 gira
-- `ratings-refresh`, al minuto 20 `trailers`: questo va al 40.
select cron.schedule('zapp-taste-refresh', '40 * * * *',
  $$select public.call_zapp_job('taste-refresh')$$);

-- Ogni notte: 90 giorni di storico e basta, più la rete di sicurezza per chi ha
-- spento la personalizzazione.
select cron.schedule('zapp-events-prune', '0 3 * * *',
  $$select public.call_zapp_job('events-prune')$$);
