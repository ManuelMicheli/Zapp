import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { searchMovies, searchTv } from "@/lib/tmdb/client";
import type { TmdbMovieResult, TmdbTvResult } from "@/lib/tmdb/types";
import { escapeLike } from "@/lib/validate";
import { MATCH_THRESHOLD, scoreCandidate } from "./rank";
import type { ParsedMedia } from "./types";

export { MATCH_THRESHOLD, scoreCandidate };
export type { ScoreCandidate } from "./rank";

/** Quante righe di cache si valutano prima di rivolgersi a TMDB. */
const CACHE_CANDIDATES = 5;
/** Quanti risultati di una ricerca TMDB si valutano. */
const SEARCH_CANDIDATES = 8;

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Quali di questi id sono offerti dal provider su cui stiamo guardando, in
 * un'unica query invece di una per candidato.
 */
async function providersOffering(
  service: ServiceClient,
  mediaType: "movie" | "tv",
  providerId: number,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data } = await service
    .from("title_providers")
    .select("title_id")
    .eq("media_type", mediaType)
    .eq("provider_id", providerId)
    .in("title_id", ids);
  return new Set((data ?? []).map((row) => row.title_id));
}

/**
 * Popolarita' approssimata di una riga di cache: `titles` non salva quella di
 * TMDB (solo `vote_average`, 0-10), quindi la si stima da li'. E' solo una
 * delle due spinte piccole di `scoreCandidate` (max 0,04), non deve essere
 * precisa.
 */
function popularityFromVote(voteAverage: number | null): number {
  return Math.min(Math.max((voteAverage ?? 0) * 10, 0), 100);
}

/** Anno da una data ISO (`release_date`/`first_air_date`/`titles.release_date`). */
function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Prima la cache `titles` (nessuna chiamata di rete: e' il caso normale, i
 * titoli che si guardano sono quasi sempre gia' stati aperti in Zapp), poi
 * TMDB. Lettura di sistema sulla cache: service client, come `getWallPosters`.
 *
 * Un errore di rete verso TMDB non deve far perdere l'evento (spec §14: "TMDB
 * giu' → mai perdere l'evento"): se la ricerca lancia, si logga e si ritorna
 * `null` come per "nessuna corrispondenza", cosi' chi chiama tratta i due casi
 * allo stesso modo (scarta o rimette in coda) invece di doversi guardare da
 * un'eccezione che il tipo di ritorno non promette. Le due letture su Supabase
 * (cache e `title_providers`) degradano gia' bene da sole (Supabase non lancia,
 * torna `{ data: null, error }`, e qui `data` viene sempre trattato con `?? []`).
 */
export async function matchTitle(
  parsed: ParsedMedia,
  providerId: number,
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  if (parsed.kind === "unknown" || !parsed.title) return null;
  const mediaType = parsed.kind === "tv" ? "tv" : "movie";
  const service = createServiceClient();

  const { data: cached } = await service
    .from("titles")
    .select("id, title, vote_average, release_date")
    .eq("media_type", mediaType)
    .ilike("title", escapeLike(parsed.title))
    .limit(CACHE_CANDIDATES);

  if (cached && cached.length > 0) {
    const withProvider = await providersOffering(
      service,
      mediaType,
      providerId,
      cached.map((row) => row.id),
    );
    let bestCached: { id: number; score: number } | null = null;
    for (const row of cached) {
      const score = scoreCandidate(parsed, {
        name: row.title,
        year: yearFromDate(row.release_date),
        hasProvider: withProvider.has(row.id),
        popularity: popularityFromVote(row.vote_average),
      });
      if (!bestCached || score > bestCached.score) bestCached = { id: row.id, score };
    }
    if (bestCached && bestCached.score >= MATCH_THRESHOLD) {
      return { titleId: bestCached.id, mediaType };
    }
  }

  let top: (TmdbMovieResult | TmdbTvResult)[];
  try {
    const results =
      mediaType === "tv"
        ? (await searchTv(parsed.title)).results
        : (await searchMovies(parsed.title)).results;
    top = results.slice(0, SEARCH_CANDIDATES);
  } catch (err) {
    console.error(`[scrobble] ricerca TMDB fallita per "${parsed.title}"`, err);
    return null;
  }
  if (top.length === 0) return null;

  const withProvider = await providersOffering(
    service,
    mediaType,
    providerId,
    top.map((r) => r.id),
  );

  let best: { id: number; score: number } | null = null;
  for (const r of top) {
    const name =
      mediaType === "tv" ? (r as TmdbTvResult).name : (r as TmdbMovieResult).title;
    const releaseDate =
      mediaType === "tv"
        ? (r as TmdbTvResult).first_air_date
        : (r as TmdbMovieResult).release_date;
    const score = scoreCandidate(parsed, {
      name,
      year: yearFromDate(releaseDate),
      hasProvider: withProvider.has(r.id),
      popularity: r.popularity ?? 0,
    });
    if (!best || score > best.score) best = { id: r.id, score };
  }

  if (best && best.score >= MATCH_THRESHOLD) return { titleId: best.id, mediaType };
  return null;
}
