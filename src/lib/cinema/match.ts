import "server-only";

import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { findByImdb } from "@/lib/tmdb/client";
import type { TitleRow } from "@/lib/tmdb/mappers";
import type { Tables } from "@/types/database";
import { matchFilmByImdb } from "./films";
import type { MockFilm } from "./mock";
import { getMyMoviesFilmId } from "./mymovies/match";
import { isMock, movieglu } from "./movieglu";
import { getCinemaSource } from "./source";
import type { CinemaGeo, FilmSummary, MgFilm } from "./types";

type FilmRow = Tables<"cinema_films">;

function isFresh(row: FilmRow): boolean {
  return Date.now() - new Date(row.fetched_at).getTime() < CINEMA_FILM_MATCH_TTL_MS;
}

function imdbOf(title: TitleRow): string | null {
  const ids = title.external_ids as { imdb_id?: string | null } | null;
  return ids?.imdb_id ?? null;
}

/** Uscito negli ultimi 120 giorni: nel mock è "al cinema". */
export function recentlyReleased(title: TitleRow): boolean {
  if (!title.release_date) return false;
  const age = Date.now() - new Date(title.release_date).getTime();
  return age >= 0 && age < 120 * 24 * 3600 * 1000;
}

/**
 * ID MovieGlu del film TMDB, via IMDb id. Persistito in `cinema_films` per un
 * giorno (anche il "non trovato", come `movieglu_film_id = null`).
 */
export async function getMovieGluFilmId(title: TitleRow): Promise<number | null> {
  if (title.media_type !== "movie") return null;
  if (isMock()) return recentlyReleased(title) ? title.id : null;

  const db = createServiceClient();
  const { data: row } = await db
    .from("cinema_films")
    .select("*")
    .eq("tmdb_id", title.id)
    .maybeSingle();
  if (row && isFresh(row)) return row.movieglu_film_id;

  const imdb = imdbOf(title);
  const list = imdb ? await movieglu.filmsNowShowing() : null;
  const film = list ? matchFilmByImdb(list.films, imdb) : null;

  const { error } = await db.from("cinema_films").upsert({
    tmdb_id: title.id,
    movieglu_film_id: film?.film_id ?? null,
    imdb_id: imdb,
    title: title.title,
    poster_path: title.poster_path,
    backdrop_path: title.backdrop_path,
    fetched_at: new Date().toISOString(),
  });
  if (error) console.error("[cinema] errore upsert cinema_films:", error);
  return film?.film_id ?? null;
}

/**
 * Film MovieGlu → riassunto con id/poster TMDB (per la pagina /cinema).
 * Ordine: mock → `cinema_films` per movieglu_film_id → TMDB find per IMDb → solo nome.
 */
export async function filmSummaryFor(film: MgFilm): Promise<FilmSummary> {
  if (isMock()) {
    const m = film as MockFilm;
    return {
      tmdbId: film.film_id,
      sourceFilmId: film.film_id,
      title: film.film_name,
      posterPath: m.poster_path ?? null,
      backdropPath: m.backdrop_path ?? null,
    };
  }

  const db = createServiceClient();
  const { data: row, error: readError } = await db
    .from("cinema_films")
    .select("*")
    .eq("movieglu_film_id", film.film_id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) console.error("[cinema] errore lettura cinema_films:", readError);
  if (row) {
    return {
      tmdbId: row.tmdb_id,
      sourceFilmId: film.film_id,
      title: row.title ?? film.film_name,
      posterPath: row.poster_path,
      backdropPath: row.backdrop_path,
    };
  }

  const imdb = film.imdb_title_id ?? null;
  const found = imdb ? await findByImdb(imdb).catch(() => null) : null;
  const hit = found?.movie_results[0];
  if (hit) {
    await db.from("cinema_films").upsert({
      tmdb_id: hit.id,
      movieglu_film_id: film.film_id,
      imdb_id: imdb,
      title: hit.title,
      poster_path: hit.poster_path,
      backdrop_path: hit.backdrop_path,
      fetched_at: new Date().toISOString(),
    });
    return {
      tmdbId: hit.id,
      sourceFilmId: film.film_id,
      title: hit.title,
      posterPath: hit.poster_path,
      backdropPath: hit.backdrop_path,
    };
  }

  return {
    tmdbId: null,
    sourceFilmId: film.film_id,
    title: film.film_name,
    posterPath: null,
    backdropPath: null,
  };
}

/** Id del film nella sorgente attiva; MyMovies richiede la provincia dell'utente. */
export async function getSourceFilmId(
  title: TitleRow,
  geo: CinemaGeo | null,
): Promise<number | null> {
  if (getCinemaSource() === "mymovies") {
    return geo?.provinceSlug ? getMyMoviesFilmId(title, geo.provinceSlug) : null;
  }
  return getMovieGluFilmId(title);
}
