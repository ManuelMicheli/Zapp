-- "Condividi in Zapp": dal link di una piattaforma si risale al titolo.
-- Senza indice la ricerca per url e' un Seq Scan su tutta la tabella.
create index title_provider_links_url_idx on public.title_provider_links (url);
