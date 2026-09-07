import "server-only";

import { MATCH_THRESHOLD, titleSimilarity } from "@/lib/import/netflix-title";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { searchMovies, searchTv } from "@/lib/tmdb/client";

/**
 * Dal titolo di una classifica all'id TMDB.
 *
 * Riusa il confronto già scritto e testato per l'import Netflix. Due differenze:
 * i titoli delle classifiche arrivano **in inglese** mentre TMDB ci risponde in
 * `it-IT`, quindi il confronto va fatto contro il nome italiano **e** l'originale;
 * e non c'è nessuna stagione da indovinare, perché la classifica premia la serie.
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
    let bestId: number | null = null;
    let bestScore = 0;

    if (mediaType === "tv") {
      const res = await searchTv(rawTitle);
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
      const res = await searchMovies(rawTitle);
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

    if (bestId === null || bestScore < MATCH_THRESHOLD) return null;
    // Senza la riga in `titles` la chiave esterna di `title_charts` rifiuterebbe l'id
    const cached = await getOrFetchTitle(bestId, mediaType);
    return cached ? bestId : null;
  } catch (e) {
    console.error(`[charts] ricerca fallita per "${rawTitle}":`, e);
    return null;
  }
}
