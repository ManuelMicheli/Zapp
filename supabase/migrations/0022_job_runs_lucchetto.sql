-- Un solo job aperto per nome.
--
-- Il lucchetto contro le esecuzioni sovrapposte non può vivere in due query separate:
-- fra il "c'è qualcuno in corso?" e l'inserimento c'è una finestra in cui entrambe le
-- esecuzioni vedono la strada libera. Misurato: due `ratings-refresh` partite a 79 ms
-- di distanza sono arrivate in fondo tutte e due. Qui il vincolo lo tiene il database,
-- dove il controllo e la scrittura sono la stessa operazione.
create unique index job_runs_uno_aperto_idx
  on public.job_runs (job)
  where ended_at is null;
