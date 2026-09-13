-- "Condividi in Zapp": dal link di una piattaforma si risale al titolo.
-- Senza indice la ricerca per url e' un Seq Scan su tutta la tabella.
-- `if not exists`: l'indice e' gia' live, creato da un'altra sessione sotto un
-- numero di migration diverso da quello registrato in questo albero.
create index if not exists title_provider_links_url_idx on public.title_provider_links (url);
