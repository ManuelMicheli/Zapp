-- Zapp — migration 0013: title_trailers diventa la cache completa dei trailer ufficiali.
-- `trailers` = [{key, frame:{x,y,w,h}}] in ordine di preferenza (chiave YouTube + riquadro
-- dell'immagine reale senza bande nere); `source` = da dove vengono ('tmdb' = video TMDB
-- verificati via oEmbed, 'youtube' = ricerca Data API, 'none' = niente trovato).
-- Ogni visita fa una sola lettura; oEmbed, miniature e ricerca girano solo a riga assente
-- o scaduta (30 giorni se piena, 1 giorno se vuota). `keys` resta per il codice già in
-- produzione: va tolta in una migration successiva.

alter table public.title_trailers
  add column trailers jsonb not null default '[]'::jsonb,
  add column source text not null default 'none'
    check (source in ('tmdb', 'youtube', 'none'));

-- le righe vecchie hanno solo `keys`: scadute, così vengono ricalcolate col riquadro
update public.title_trailers set checked_at = '1970-01-01';
