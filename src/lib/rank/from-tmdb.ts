import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import type { MediaType, RankCandidate } from "./types";

/**
 * Un risultato TMDB come lo vuole il motore. Sta in un modulo suo, senza `server-only`
 * e senza dipendenze, perché lo usano sia `candidates.ts` sia i moduli che gli passano
 * candidati (`scoped.ts`, la fila del momento): due copie della stessa conversione si
 * sarebbero disallineate al primo campo nuovo.
 */
export function candidatiDaTmdb(
  results: TmdbMultiResult[] | undefined,
  type: MediaType,
): RankCandidate[] {
  return (results ?? [])
    .filter((r) => r.media_type === type)
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType: type,
      title: searchResultTitle(r),
      posterPath: r.poster_path as string,
      backdropPath: r.backdrop_path ?? null,
      overview: r.overview?.trim() || null,
      year: searchResultYear(r),
      genreIds: r.genre_ids ?? [],
      runtime: null,
      originalLanguage: null,
      providerIds: [],
      people: [],
      zappScore: null,
      voteAverage: r.vote_average ?? null,
      voteCount: r.vote_count ?? null,
      friends: null,
    }));
}

export function chiaveCandidato(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}
