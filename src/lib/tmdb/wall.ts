import "server-only";
import { getMovieList, getTrending, getTvList } from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { createServiceClient } from "@/lib/supabase/server";

/** Locandine massime per il muro: 20 colonne × 4 senza ripetizioni = 80, 60 bastano. */
const WALL_SIZE = 60;
/** Sotto questa soglia il muro sarebbe povero: si passa al fallback. */
const WALL_MIN = 8;

/**
 * Locandine per il muro di sfondo (login, signup, onboarding, home):
 * sempre i titoli del momento, da più liste TMDB lette in parallelo e mescolate
 * a rotazione, così le prime colonne (le più visibili) alternano trending,
 * nuove uscite al cinema, prossime uscite e serie in onda. Ogni lista ha la
 * cache Next da 1h (la pagina 1 del trending è la stessa `fetch` di Scopri);
 * se una lista fallisce restano le altre. Fallback: ultime locandine in cache locale.
 */
export async function getWallPosters(): Promise<string[]> {
  const sources = await Promise.allSettled([
    getTrending(1),
    getTrending(2),
    getMovieList("now_playing"),
    getMovieList("upcoming"),
    getTvList("on_the_air"),
  ]);
  const lists = sources.flatMap((s) =>
    s.status === "fulfilled"
      ? [s.value.results.filter(isPosterResult).map((r) => r.poster_path as string)]
      : [],
  );

  const paths = uniquePaths(roundRobin(lists)).slice(0, WALL_SIZE);
  if (paths.length >= WALL_MIN) return paths;
  return getCachedPosters();
}

/** Voce minima di `watch_entries` con il titolo incorporato, per il muro del profilo. */
export interface WallEntry {
  status: "want" | "watching" | "watched" | "dropped";
  rating: number | null;
  updated_at?: string | null;
  title: {
    poster_path: string | null;
    genres: unknown;
  } | null;
}

/**
 * Muro personale del profilo: la storia di chi guarda, non i trending.
 * Ordine (dedupe per locandina):
 * 1. in alternanza, ciò che sta guardando ora (più recente prima) e i suoi
 *    preferiti (voto più alto prima) — sono le prime colonne, le più visibili;
 * 2. preferiti dedotti dalle statistiche: titoli visti nei generi che guarda di più;
 * 3. il resto di ciò che ha visto, poi la lista dei desideri;
 * 4. riempimento con i titoli del momento, così il muro è pieno anche a profilo nuovo.
 */
export async function getProfileWallPosters(entries: WallEntry[]): Promise<string[]> {
  const withPoster = entries.filter((e) => e.title?.poster_path);
  const byRecent = (a: WallEntry, b: WallEntry) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

  const watching = withPoster.filter((e) => e.status === "watching").sort(byRecent);
  const favourites = withPoster
    .filter((e) => e.rating != null && e.rating >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byRecent(a, b));

  // generi più visti → titoli visti che li contengono, ordinati per quanti ne toccano
  const watched = withPoster.filter((e) => e.status === "watched");
  const genreCount = new Map<string, number>();
  for (const e of watched) {
    for (const name of genreNames(e.title?.genres)) {
      genreCount.set(name, (genreCount.get(name) ?? 0) + 1);
    }
  }
  const topGenres = new Set(
    [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name),
  );
  const genreScore = (e: WallEntry) =>
    genreNames(e.title?.genres).filter((g) => topGenres.has(g)).length;
  const inferred = watched
    .filter((e) => genreScore(e) > 0)
    .sort((a, b) => genreScore(b) - genreScore(a) || byRecent(a, b));

  const rest = [
    ...watched.sort(byRecent),
    ...withPoster.filter((e) => e.status === "want"),
  ];

  const own = uniquePaths(
    [...roundRobin([watching, favourites]), ...inferred, ...rest].map(
      (e) => e.title!.poster_path as string,
    ),
  );
  if (own.length >= WALL_SIZE) return own.slice(0, WALL_SIZE);
  const filler = await getWallPosters();
  return uniquePaths([...own, ...filler]).slice(0, WALL_SIZE);
}

function isPosterResult(r: TmdbMultiResult): boolean {
  return (r.media_type === "movie" || r.media_type === "tv") && Boolean(r.poster_path);
}

function genreNames(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((g) => (g && typeof g === "object" ? (g as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string");
}

/** Alterna gli elementi delle liste: a0, b0, c0, a1, b1, c1… (liste vuote saltate). */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

/**
 * Ripiego sulla cache `titles`. Mai un errore: senza chiave service-role (build
 * di anteprima senza env) o con il DB giù il muro resta vuoto, ma la pagina di
 * login si prerenderizza lo stesso.
 */
async function getCachedPosters(): Promise<string[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("titles")
      .select("poster_path")
      .not("poster_path", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(WALL_SIZE);
    return (data ?? []).map((t) => t.poster_path as string);
  } catch {
    return [];
  }
}
