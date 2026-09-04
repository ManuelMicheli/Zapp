-- Fonte "justwatch" per i link diretti alle pagine titolo delle piattaforme.
alter table public.title_provider_links
  drop constraint if exists title_provider_links_source_check;

alter table public.title_provider_links
  add constraint title_provider_links_source_check
  check (source in ('manual', 'justwatch', 'wikidata', 'search'));

-- I vecchi link di ricerca vanno rigenerati subito con la nuova cascata.
delete from public.title_provider_links where source = 'search';
