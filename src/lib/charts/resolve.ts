import "server-only";

import { MATCH_THRESHOLD, titleSimilarity } from "@/lib/import/netflix-title";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { searchMovies, searchTv } from "@/lib/tmdb/client";

/** Lingue di ricerca, in ordine: i titoli delle classifiche arrivano in inglese. */
const SEARCH_LANGUAGES = ["en-US", "it-IT"] as const;

/**
 * Dal titolo di una classifica all'id TMDB.
 *
 * Riusa il confronto già scritto e testato per l'import Netflix. Ma i titoli delle
 * classifiche non sono quelli dell'import: arrivano **in inglese**, non nella lingua
 * dell'utente. Cercando su TMDB con `it-IT` (la lingua di default del client) `title`
 * e `original_title` tornano il titolo italiano e quello nella lingua di produzione —
 * mai l'inglese — e per un film come "Daddy's in Trouble" (IT "Un papà nei guai", originale
 * portoghese "Um Pai em Apuros") il confronto fallisce contro entrambi anche se il film
 * è il primo risultato della ricerca. Si cerca quindi prima in inglese, e solo se non
 * basta si riprova in italiano (un titolo italiano diverso dall'inglese e dall'originale,
 * es. "Kill Bill: Volume 1" reso identico): non serve interrogare entrambe le lingue
 * quando la prima già trova un match sopra soglia.
 *
 * Prima di restituire l'id, il titolo viene messo in cache con `getOrFetchTitle`:
 * `title_charts.title_id` ha una chiave esterna su `titles`, e scrivere l'id di un
 * titolo che non abbiamo mai scaricato farebbe fallire l'insert.
 */
export async function resolveChartTitle(
  rawTitle: string,
  mediaType: "movie" | "tv",
): Promise<number | null> {
  try {
    for (const language of SEARCH_LANGUAGES) {
      const best = await bestMatch(rawTitle, mediaType, language);
      if (best === null) continue;
      // Senza la riga in `titles` la chiave esterna di `title_charts` rifiuterebbe l'id
      const cached = await getOrFetchTitle(best, mediaType);
      if (cached) return best;
    }
    return null;
  } catch (e) {
    console.error(`[charts] ricerca fallita per "${rawTitle}":`, e);
    return null;
  }
}

/** Il risultato più somigliante in una lingua, o `null` se nessuno supera la soglia. */
async function bestMatch(
  rawTitle: string,
  mediaType: "movie" | "tv",
  language: string,
): Promise<number | null> {
  let bestId: number | null = null;
  let bestScore = 0;

  if (mediaType === "tv") {
    const res = await searchTv(rawTitle, { language });
    for (const item of res.results) {
      for (const name of [item.name, item.original_name]) {
        if (!name) continue;
        const score = titleSimilarity(rawTitle, name);
        if (score > bestScore) {
          bestScore = score;
          bestId = item.id;
        }
      }
    }
  } else {
    const res = await searchMovies(rawTitle, { language });
    for (const item of res.results) {
      for (const name of [item.title, item.original_title]) {
        if (!name) continue;
        const score = titleSimilarity(rawTitle, name);
        if (score > bestScore) {
          bestScore = score;
          bestId = item.id;
        }
      }
    }
  }

  return bestScore >= MATCH_THRESHOLD ? bestId : null;
}
