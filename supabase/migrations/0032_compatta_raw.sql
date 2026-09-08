-- Stessa dieta di src/lib/tmdb/slim-raw.ts, applicata alle righe gia' salvate.
--
-- Senza questo passaggio i titoli vecchi si sgonfierebbero solo alla prima
-- apertura della loro scheda, cioe' quasi mai per la coda lunga del catalogo, e
-- intanto lo spazio resterebbe occupato. Nessuna chiamata a TMDB: si tolgono
-- chiavi da un JSON che c'e' gia'.
--
-- `titles.seasons` e' una colonna generata da raw->'seasons' (migration 0010):
-- 'seasons' non viene toccata, quindi il valore generato non cambia. I mestieri
-- tenuti sono gli stessi cinque di slim-raw.ts; se cambiano di la', cambiano
-- anche qui.
update public.titles t
set raw = (
  (t.raw - 'watch/providers' - 'images')
  || case when t.raw ? 'credits' then jsonb_build_object('credits', jsonb_build_object(
       'cast', coalesce((
         select jsonb_agg(e.c order by e.ord)
         from jsonb_array_elements(coalesce(t.raw->'credits'->'cast', '[]'::jsonb))
              with ordinality as e(c, ord)
         where e.ord <= 30
       ), '[]'::jsonb),
       'crew', coalesce((
         select jsonb_agg(c)
         from jsonb_array_elements(coalesce(t.raw->'credits'->'crew', '[]'::jsonb)) as c
         where c->>'job' in ('Director', 'Screenplay', 'Writer', 'Story', 'Novel')
       ), '[]'::jsonb)
     )) else '{}'::jsonb end
  || case when t.raw ? 'recommendations' then jsonb_build_object('recommendations',
       (t.raw->'recommendations') || jsonb_build_object('results', coalesce((
         select jsonb_agg(e.r order by e.ord)
         from jsonb_array_elements(coalesce(t.raw->'recommendations'->'results', '[]'::jsonb))
              with ordinality as e(r, ord)
         where e.ord <= 12
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
  || case when t.raw ? 'release_dates' then jsonb_build_object('release_dates',
       jsonb_build_object('results', coalesce((
         select jsonb_agg(r)
         from jsonb_array_elements(coalesce(t.raw->'release_dates'->'results', '[]'::jsonb)) as r
         where r->>'iso_3166_1' = 'IT'
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
  || case when t.raw ? 'content_ratings' then jsonb_build_object('content_ratings',
       jsonb_build_object('results', coalesce((
         select jsonb_agg(r)
         from jsonb_array_elements(coalesce(t.raw->'content_ratings'->'results', '[]'::jsonb)) as r
         where r->>'iso_3166_1' = 'IT'
       ), '[]'::jsonb))
     ) else '{}'::jsonb end
)
where t.raw ? 'watch/providers' or t.raw ? 'images' or t.raw ? 'credits'
   or t.raw ? 'recommendations' or t.raw ? 'release_dates' or t.raw ? 'content_ratings';

-- L'update riscrive le righe ma lo spazio vecchio resta occupato finche' non
-- passa il vacuum. Va lanciato a mano dopo la migration (non sta qui: `vacuum
-- full` prende un lock esclusivo sulla tabella e non puo' stare in una
-- transazione):
--
--   vacuum (full, analyze) public.titles;
