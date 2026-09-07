import "server-only";

import { getSeason, searchMovies, searchTv } from "@/lib/tmdb/client";
import type { TmdbMovieResult, TmdbTvResult } from "@/lib/tmdb/types";
import {
  MATCH_THRESHOLD,
  pickBestMatch,
  queryVariants,
  resolveEpisodeNumber,
  type BestMatch,
} from "./netflix-title";
import type { ImportCandidate, NetflixRow } from "./netflix-rows";
import type { ImportProposal } from "./netflix-proposals";

export { groupRows, parseNetflixCsvText } from "./netflix-rows";
export type { ImportCandidate, ImportProposal, NetflixRow };

// ============ matching su TMDB ============

const BATCH_SIZE = 10;

interface Scored<T> {
  names: (string | null | undefined)[];
  result: T;
}

/**
 * Prova i nomi in ordine e, per ciascuno, le query da lunga a corta; il confronto
 * è sempre con il nome intero (`pickBestMatch`). Si ferma al primo risultato
 * sopra soglia, così nel caso comune basta una chiamata.
 */
async function findBest<T>(
  names: string[],
  search: (query: string) => Promise<{ results: T[] }>,
  namesOf: (r: T) => (string | null | undefined)[],
  threshold = MATCH_THRESHOLD,
): Promise<BestMatch<Scored<T>> | null> {
  // stessa query per due nomi ("Show: Stagione X" e "Show") → una sola chiamata
  const cache = new Map<string, T[]>();
  for (const name of names) {
    for (const query of queryVariants(name)) {
      let results = cache.get(query);
      if (!results) {
        results = (await search(query)).results;
        cache.set(query, results);
      }
      const best = pickBestMatch(
        name,
        results.map((result) => ({ names: namesOf(result), result })),
        threshold,
      );
      if (best) return best;
    }
  }
  return null;
}

const movieNames = (m: TmdbMovieResult) => [m.title, m.original_title];
const tvNames = (t: TmdbTvResult) => [t.name, t.original_name];

/**
 * Numero d'episodio vero: i nomi degli episodi del CSV cercati nell'elenco TMDB
 * della stagione. Il conteggio delle righe basta solo al primo import completo;
 * su un export parziale ("ho visto 3 puntate nuove") darebbe 3 e farebbe
 * sembrare il progresso un passo indietro, quindi l'import saltava la serie.
 * Una sola `getSeason` per serie (memo + cache Next del client TMDB); null se
 * nessun nome corrisponde o TMDB non risponde.
 */
async function resolveEpisode(
  tmdbId: number,
  season: number,
  episodeTitles: string[],
): Promise<number | null> {
  if (episodeTitles.length === 0) return null;
  try {
    const details = await getSeason(tmdbId, season);
    return resolveEpisodeNumber(episodeTitles, details.episodes ?? []);
  } catch {
    return null;
  }
}

function unmatched(candidate: ImportCandidate): ImportProposal {
  return {
    ...candidate,
    tmdbId: null,
    matchedTitle: null,
    posterPath: null,
    year: null,
    exact: false,
    viaFallback: false,
  };
}

async function matchOne(candidate: ImportCandidate): Promise<ImportProposal> {
  if (candidate.kind === "tv") {
    const names = candidate.altTitle
      ? [candidate.altTitle, candidate.netflixTitle]
      : [candidate.netflixTitle];
    const best = await findBest(names, searchTv, tvNames);
    if (!best) return unmatched(candidate);
    const hit = best.item.result;
    const season = candidate.season ?? 1;
    const resolved = await resolveEpisode(hit.id, season, candidate.episodeTitles);
    return {
      ...candidate,
      season,
      episode: resolved ?? candidate.episode,
      tmdbId: hit.id,
      matchedTitle: hit.name,
      posterPath: hit.poster_path ?? null,
      year: hit.first_air_date ? hit.first_air_date.slice(0, 4) : null,
      exact: best.exact,
      viaFallback: false,
    };
  }

  const movie = await findBest([candidate.netflixTitle], searchMovies, movieNames);
  if (movie) {
    const hit = movie.item.result;
    return {
      ...candidate,
      tmdbId: hit.id,
      matchedTitle: hit.title,
      posterPath: hit.poster_path ?? null,
      year: hit.release_date ? hit.release_date.slice(0, 4) : null,
      exact: movie.exact,
      viaFallback: false,
    };
  }

  // Non è un film: può essere una serie scritta senza stagione — il titolo
  // intero ("Our Planet") o, per un "A: B", la sola parte A (docuserie,
  // speciali). Una riga = un episodio; `mergeProposals` li somma.
  // Solo nome identico: con la sola somiglianza "Star Wars: Una nuova speranza"
  // finirebbe in "Star Wars: The Clone Wars".
  {
    const names = candidate.fallbackShow
      ? [candidate.netflixTitle, candidate.fallbackShow]
      : [candidate.netflixTitle];
    const tv = await findBest(names, searchTv, tvNames, 1);
    if (tv) {
      const hit = tv.item.result;
      return {
        ...candidate,
        kind: "tv",
        season: 1,
        episode: 1,
        tmdbId: hit.id,
        matchedTitle: hit.name,
        posterPath: hit.poster_path ?? null,
        year: hit.first_air_date ? hit.first_air_date.slice(0, 4) : null,
        exact: false,
        viaFallback: true,
      };
    }
  }
  return unmatched(candidate);
}

/**
 * Riconosce i candidati su TMDB a gruppi di `BATCH_SIZE`. Nessuna pausa fra i
 * gruppi: il throttle del client TMDB (15 req/s) è già il freno, la pausa
 * aggiungeva solo attesa a un blocco che il client chiama in parallelo.
 * Non lancia mai: un errore di rete lascia il candidato non riconosciuto.
 */
export async function matchCandidates(
  candidates: ImportCandidate[],
): Promise<ImportProposal[]> {
  const proposals: ImportProposal[] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      // un errore di rete costa il titolo per sempre (l'import non lo ripesca):
      // un secondo tentativo prima di darlo per non riconosciuto
      batch.map((candidate) =>
        matchOne(candidate).catch(() =>
          matchOne(candidate).catch(() => unmatched(candidate)),
        ),
      ),
    );
    proposals.push(...results);
  }
  return proposals;
}
