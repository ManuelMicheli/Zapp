import "server-only";

import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { searchMovie } from "@/lib/tmdb/client";
import type { TitleRow } from "@/lib/tmdb/mappers";
import type { FilmSummary } from "../types";
import { mymovies } from "./client";
import { normalizeTitle, parseNowShowing, type MmFilmProgramme } from "./parse";

/**
 * Id MyMovies del film TMDB: dal titolo (italiano o originale) confrontato con i film
 * in programmazione nella provincia; salvato in `cinema_films` per un giorno.
 */
export async function getMyMoviesFilmId(
  title: TitleRow,
  prov: string,
): Promise<number | null> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("cinema_films")
    .select("mymovies_film_id, fetched_at")
    .eq("tmdb_id", title.id)
    .maybeSingle();
  if (
    row?.mymovies_film_id != null &&
    Date.now() - new Date(row.fetched_at).getTime() < CINEMA_FILM_MATCH_TTL_MS
  ) {
    return row.mymovies_film_id;
  }

  const html = await mymovies.provinceIndex(prov);
  if (!html) return row?.mymovies_film_id ?? null;
  const wanted = new Set(
    [title.title, title.original_title].filter(Boolean).map((t) => normalizeTitle(t!)),
  );
  const hit = parseNowShowing(html).find((f) => wanted.has(normalizeTitle(f.title)));
  if (!hit) return null;

  const { error } = await db.from("cinema_films").upsert({
    tmdb_id: title.id,
    mymovies_film_id: hit.filmId,
    title: title.title,
    poster_path: title.poster_path,
    backdrop_path: title.backdrop_path,
    fetched_at: new Date().toISOString(),
  });
  if (error) console.error("[cinema] errore upsert cinema_films:", error);
  return hit.filmId;
}

/** Film MyMovies → riassunto con id/poster TMDB (cache in `cinema_films`, poi ricerca). */
export async function filmSummaryForMyMovies(
  film: Pick<MmFilmProgramme, "filmId" | "title" | "year">,
): Promise<FilmSummary> {
  const db = createServiceClient();
  const { data: row, error: readError } = await db
    .from("cinema_films")
    .select("*")
    .eq("mymovies_film_id", film.filmId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) console.error("[cinema] errore lettura cinema_films:", readError);
  if (row) {
    return {
      tmdbId: row.tmdb_id,
      sourceFilmId: film.filmId,
      title: row.title ?? film.title,
      posterPath: row.poster_path,
      backdropPath: row.backdrop_path,
    };
  }

  const found = await searchMovie(film.title, film.year).catch(() => null);
  const wanted = normalizeTitle(film.title);
  const hit =
    found?.results.find((r) => normalizeTitle(r.title) === wanted) ?? found?.results[0];
  if (hit) {
    const { error } = await db.from("cinema_films").upsert({
      tmdb_id: hit.id,
      mymovies_film_id: film.filmId,
      title: hit.title,
      poster_path: hit.poster_path ?? null,
      backdrop_path: hit.backdrop_path ?? null,
      fetched_at: new Date().toISOString(),
    });
    if (error) console.error("[cinema] errore upsert cinema_films:", error);
    return {
      tmdbId: hit.id,
      sourceFilmId: film.filmId,
      title: hit.title,
      posterPath: hit.poster_path ?? null,
      backdropPath: hit.backdrop_path ?? null,
    };
  }
  return {
    tmdbId: null,
    sourceFilmId: film.filmId,
    title: film.title,
    posterPath: null,
    backdropPath: null,
  };
}
