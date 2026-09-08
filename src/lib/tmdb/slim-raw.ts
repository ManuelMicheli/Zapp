/**
 * Cosa finisce davvero in `titles.raw`.
 *
 * Misura del 2026-09-08 su 3.699 titoli, byte logici medi per riga:
 * `watch/providers` 41 KB (ed e' gia' tutto in `title_providers`), `credits`
 * 30 KB (di cui si legge il cast di testa e cinque mestieri), `recommendations`
 * 17,5 KB (di cui ne servono dodici), `release_dates` 8,3 KB (novanta paesi, ne
 * serve uno), `images` 12 KB (rimasta dopo che la galleria e' stata tolta il
 * 2026-09-07). Cioe' il grosso del catalogo era roba che nessuna riga di codice
 * apre mai.
 *
 * Conta perche' `titles` e' **condiviso fra tutti gli utenti**: e' l'unica
 * tabella che cresce col numero di gusti diversi invece che col numero di
 * persone, e il piano Supabase Free si ferma a 500 MB.
 *
 * Il taglio si fa qui e non nella chiamata a TMDB: `getMovie`/`getTv`
 * continuano a chiedere l'`append_to_response` completo in una volta sola, e
 * `watch/providers` serve ancora nella risposta perche' e' la sorgente di
 * `title_providers`. Sparisce solo da quello che si salva.
 *
 * **Chi aggiunge un campo che il codice legge deve aggiungerlo anche qui**,
 * altrimenti sparisce al primo aggiornamento del titolo.
 */

/** Quanti interpreti: `CastRow` ne mostra 20 e apre il resto sul posto. */
const CAST_MAX = 30;

/**
 * I mestieri che il codice legge davvero: `facts.ts` (regia e sceneggiatura
 * nella scheda), `similar/signals.ts` (`WRITER_JOBS`), `taste/refresh.ts` e la
 * funzione SQL `title_people` (regia). Produttori e maestranze non li guarda
 * nessuno.
 */
const MESTIERI = new Set(["Director", "Screenplay", "Writer", "Story", "Novel"]);

/** Quanti consigli: il motore dei simili ne pesca al massimo una decina. */
const RECO_MAX = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Di `release_dates` e `content_ratings` interessa solo la riga italiana. */
function soloItalia(v: unknown): unknown {
  if (!isRecord(v) || !Array.isArray(v.results)) return v;
  return {
    ...v,
    results: v.results.filter((r) => isRecord(r) && r.iso_3166_1 === "IT"),
  };
}

export function slimRaw(dettagli: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...dettagli };

  delete out["watch/providers"];
  delete out.images;

  if (isRecord(out.credits)) {
    const cast = Array.isArray(out.credits.cast) ? out.credits.cast : [];
    const crew = Array.isArray(out.credits.crew) ? out.credits.crew : [];
    out.credits = {
      cast: cast.slice(0, CAST_MAX),
      crew: crew.filter(
        (c) => isRecord(c) && typeof c.job === "string" && MESTIERI.has(c.job),
      ),
    };
  }

  if (isRecord(out.recommendations) && Array.isArray(out.recommendations.results)) {
    out.recommendations = {
      ...out.recommendations,
      results: out.recommendations.results.slice(0, RECO_MAX),
    };
  }

  if (out.release_dates !== undefined) out.release_dates = soloItalia(out.release_dates);
  if (out.content_ratings !== undefined) {
    out.content_ratings = soloItalia(out.content_ratings);
  }

  return out;
}
