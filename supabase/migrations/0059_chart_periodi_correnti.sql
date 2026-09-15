-- L'ultimo periodo scritto da ogni coppia (fonte, provider), per paese.
--
-- Prima questo calcolo stava in JS: si leggevano le 500 righe piu' recenti di
-- `title_charts` e si raggruppava in memoria. E' una bomba a orologeria, e il
-- 2026-09-15 e' esplosa: JustWatch scrive 60 righe al giorno (3 provider x 20),
-- Netflix una volta a settimana e con ~15 giorni di ritardo, quindi al nono giorno
-- di JustWatch accumulato le 540 righe piu' recenti avevano gia' spinto fuori
-- dalla finestra ogni riga `netflix_tudum`. Risultato senza un solo errore:
-- "In salita questa settimana" con un titolo invece di quattordici, e le pillole
-- "#7 su Netflix" sparite da tutte le locandine.
--
-- Qui non c'e' nessun limite di righe: il raggruppamento lo fa Postgres, e resta
-- corretto per costruzione qualunque sia la cadenza delle fonti e quanto cresca
-- la tabella.
create or replace view public.chart_periodi_correnti
with (security_invoker = true) as
select distinct on (country, source, provider_id)
  country,
  source,
  provider_id,
  period
from public.title_charts
where title_id is not null
order by country, source, provider_id, period desc;

comment on view public.chart_periodi_correnti is
  'Ultimo periodo per (paese, fonte, provider). Le classifiche filtrano su questi periodi: mai una finestra di giorni fissa, mai un limite di righe.';
