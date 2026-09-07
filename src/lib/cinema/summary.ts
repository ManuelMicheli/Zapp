import "server-only";

import { unstable_cache } from "next/cache";
import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { searchMovie } from "@/lib/tmdb/client";
import { normalizeTitle } from "./mymovies/parse";
import type { FilmSummary } from "./types";

/** Id stabile e negativo da un titolo: non collide con gli id MyMovies (positivi). */
export function titleHashId(title: string): number {
  let h = 0;
  for (const ch of normalizeTitle(title)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return -(Math.abs(h) + 1);
}

interface TmdbHit {
  id: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}

/**
 * Film TMDB dal titolo di una catena (italiano, poi originale): uguaglianza dopo
 * `normalizeTitle`, altrimenti il primo risultato. In `unstable_cache` per titolo
 * normalizzato (un giorno): le stesse 30–80 voci tornano a ogni richiesta.
 */
async function lookupTmdb(
  title: string,
  originalTitle: string | null,
): Promise<TmdbHit | null> {
  const candidates = [title, originalTitle].filter((t): t is string => !!t);
  for (const raw of candidates) {
    // "Oceania (2026)": l'anno fra parentesi esce dalla query e diventa il filtro anno
    const year = /\((\d{4})\)/.exec(raw)?.[1];
    const q = raw.replace(/\s*\(\d{4}\)\s*/g, " ").trim() || raw;
    const found = await searchMovie(q, year ? Number(year) : null).catch(() => null);
    if (!found) continue;
    const wanted = normalizeTitle(q);
    const hit =
      found.results.find((r) => normalizeTitle(r.title) === wanted) ??
      found.results.find(
        (r) => r.original_title && normalizeTitle(r.original_title) === wanted,
      ) ??
      (raw === candidates[candidates.length - 1] ? found.results[0] : undefined);
    if (hit) {
      return {
        id: hit.id,
        title: hit.title,
        posterPath: hit.poster_path ?? null,
        backdropPath: hit.backdrop_path ?? null,
      };
    }
  }
  return null;
}

/** Riassunto con id/poster TMDB per un film noto solo per titolo (programmi delle catene). */
export async function filmSummaryByTitle(
  title: string,
  originalTitle: string | null,
): Promise<FilmSummary> {
  const key = normalizeTitle(originalTitle ?? title) || normalizeTitle(title);
  const hit = await unstable_cache(
    () => lookupTmdb(title, originalTitle),
    ["cinema-title", key],
    {
      revalidate: Math.floor(CINEMA_FILM_MATCH_TTL_MS / 1000),
    },
  )().catch(() => null);
  if (hit) {
    return {
      tmdbId: hit.id,
      sourceFilmId: hit.id,
      title: hit.title,
      posterPath: hit.posterPath,
      backdropPath: hit.backdropPath,
    };
  }
  return {
    tmdbId: null,
    sourceFilmId: titleHashId(title),
    title,
    posterPath: null,
    backdropPath: null,
  };
}
