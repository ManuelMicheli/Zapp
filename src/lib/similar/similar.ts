import "server-only";

import { cache } from "react";
import { getRatings, ratingKey } from "@/lib/ratings/queries";
import {
  discoverByKeyword,
  getCollection,
  getPersonMovieCredits,
  getPersonTvCredits,
  getSimilar,
} from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { collectCandidates, type TmdbSource } from "./candidates";
import { candidateKey, rankCandidates, SIMILAR_SIZE } from "./score";
import { seedProfile } from "./signals";
import { isFresh, readSimilar, writeSimilar } from "./store";
import type { MediaType, SimilarItem } from "./types";

/**
 * La facciata del motore: "dammi i titoli dello stesso filone di questo".
 *
 * **DB-first**, come i trailer: una visita normale è **una sola lettura** di
 * `title_similar` e zero chiamate a TMDB. Il calcolo — sei o sette chiamate in
 * parallelo — avviene solo quando la riga manca o è scaduta, e il risultato vale poi
 * per tutti gli utenti, perché la classifica salvata è impersonale.
 *
 * Il ripiego, quando il calcolo non produce niente (TMDB muto, titolo senza
 * keyword), sono le raccomandazioni grezze di TMDB: cioè esattamente il
 * comportamento che l'app aveva prima di questo motore. Peggio di così non si va.
 */
/** Le chiamate vere: in app il client TMDB, nello script di verifica un fetch nudo. */
const TMDB: TmdbSource = {
  discoverByKeyword,
  getPersonMovieCredits,
  getPersonTvCredits,
  getCollection,
  getSimilar,
};

export const getSimilarTitles = cache(
  async (
    titleId: number,
    mediaType: MediaType,
    size: number = SIMILAR_SIZE,
  ): Promise<SimilarItem[]> => {
    const stored = await readSimilar(titleId, mediaType).catch(() => null);
    if (stored && isFresh(stored.computedAt, stored.items)) {
      return stored.items.slice(0, size);
    }

    const cached = await getTitleCached(titleId, mediaType, true).catch(() => null);
    const raw = (cached?.title.raw ?? null) as Record<string, unknown> | null;
    const seed = seedProfile(raw, mediaType);
    if (!seed) return stored?.items.slice(0, size) ?? [];

    const collaborative = ((
      raw?.recommendations as { results?: TmdbMultiResult[] } | undefined
    )?.results ?? []) as TmdbMultiResult[];

    const candidates = await collectCandidates(seed, TMDB, collaborative).catch(() => []);
    if (candidates.length === 0) {
      return fallback(collaborative, mediaType, size);
    }

    // Un'unica query per i voti di tutti i candidati (fase B): lo ZappScore rompe i
    // pareggi e affonda la spazzatura, senza mai ribaltare il filone.
    const ratings = await getRatings(
      candidates.map((c) => ({ id: c.id, mediaType: c.mediaType })),
    ).catch(() => new Map());
    const scores = new Map<string, number | null>();
    for (const candidate of candidates) {
      const stored = ratings.get(ratingKey(candidate.id, candidate.mediaType));
      scores.set(
        candidateKey(candidate.id, candidate.mediaType),
        stored?.score ?? candidate.voteAverage,
      );
    }

    const items = rankCandidates(seed, candidates, { ratings: scores });
    await writeSimilar(titleId, mediaType, items, seed).catch(() => {});
    if (items.length === 0) return fallback(collaborative, mediaType, size);
    return items.slice(0, size);
  },
);

/**
 * Ripiego: le raccomandazioni grezze di TMDB, nella forma del motore così che la UI
 * non debba conoscere due tipi. Senza motivo, perché non sappiamo perché siano lì —
 * ed è proprio questo il limite da cui nasce tutto il modulo.
 */
function fallback(
  results: readonly TmdbMultiResult[],
  mediaType: MediaType,
  size: number,
): SimilarItem[] {
  return results
    .filter((r) => r.media_type === mediaType && r.poster_path)
    .slice(0, size)
    .map((r) => {
      const asMovie = r as Extract<TmdbMultiResult, { media_type: "movie" }>;
      const asTv = r as Extract<TmdbMultiResult, { media_type: "tv" }>;
      const date = mediaType === "movie" ? asMovie.release_date : asTv.first_air_date;
      return {
        id: r.id,
        mediaType,
        title: (mediaType === "movie" ? asMovie.title : asTv.name) ?? "",
        posterPath: r.poster_path ?? null,
        year: date ? Number(date.slice(0, 4)) || null : null,
        score: 0,
        reason: null,
        directorId: null,
        keywordIds: [],
        genreIds: r.genre_ids ?? [],
      };
    });
}
