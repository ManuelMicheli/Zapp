-- Il quarto job: le classifiche di Prime Video, Disney+ e Apple TV+ da JustWatch.
--
-- Manca dalla 0021 perché è stato aggiunto a mano sul progetto vivo mentre il codice del
-- job veniva scritto. Senza questa riga, un database ricostruito dalle migration avrebbe
-- tre scaffali su quattro perennemente vuoti, il che è indistinguibile da "non ci sono
-- ancora dati". `cron.schedule` sullo stesso nome riscrive, quindi applicarla dove il job
-- esiste già non fa danno.
select cron.schedule(
  'zapp-charts-justwatch',
  '0 5 * * *',
  $$select public.call_zapp_job('charts-justwatch')$$
);
