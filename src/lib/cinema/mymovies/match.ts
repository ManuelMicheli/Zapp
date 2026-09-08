import "server-only";

import { CINEMA_FILM_MATCH_TTL_MS } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/server";
import { searchMovie } from "@/lib/tmdb/client";
import type { TitleRow } from "@/lib/tmdb/mappers";
import type { FilmSummary } from "../types";
import { mymovies } from "./client";
import {
  normalizeTitle,
  parseFilmId,
  parseFilmPageLinks,
  parseNowShowing,
  type MmFilmProgramme,
} from "./parse";

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

  const wanted = new Set(
    [title.title, title.original_title].filter(Boolean).map((t) => normalizeTitle(t!)),
  );
  const found = await findFilmId(prov, wanted);
  // sorgente irraggiungibile: si tiene l'id vecchio, non si scrive un "non c'è"
  if (found === "unreachable") return row?.mymovies_film_id ?? null;
  if (found == null) return null;

  const { error } = await db.from("cinema_films").upsert({
    tmdb_id: title.id,
    mymovies_film_id: found,
    title: title.title,
    poster_path: title.poster_path,
    backdrop_path: title.backdrop_path,
    fetched_at: new Date().toISOString(),
  });
  if (error) console.error("[cinema] errore upsert cinema_films:", error);
  return found;
}

/**
 * Id `?f=` del film nella provincia. Due sorgenti, perché da settembre 2026 l'indice
 * di provincia non porta più i link `?f=`: la **pagina del capoluogo** li ha ancora
 * (novità e "Film di oggi"), e l'indice di provincia ha le locandine, cioè titolo e
 * slug della scheda, da cui `idfilm` con una richiesta in più (in cache 30 giorni).
 * `"unreachable"` quando MyMovies non risponde: chi chiama non deve scambiarlo per
 * "film non in programmazione".
 */
async function findFilmId(
  prov: string,
  wanted: Set<string>,
): Promise<number | null | "unreachable"> {
  const [cityHtml, indexHtml] = await Promise.all([
    mymovies.cityIndex(prov),
    mymovies.provinceIndex(prov),
  ]);
  if (!cityHtml && !indexHtml) return "unreachable";

  for (const html of [cityHtml, indexHtml]) {
    if (!html) continue;
    const hit = parseNowShowing(html).find((f) => wanted.has(normalizeTitle(f.title)));
    if (hit) return hit.filmId;
  }

  for (const html of [indexHtml, cityHtml]) {
    if (!html) continue;
    const page = parseFilmPageLinks(html).find((f) =>
      wanted.has(normalizeTitle(f.title)),
    );
    if (!page) continue;
    const filmHtml = await mymovies.filmPage(page.year, page.slug);
    const id = filmHtml ? parseFilmId(filmHtml) : null;
    if (id != null) return id;
  }
  return null;
}

type MmFilmRef = Pick<MmFilmProgramme, "filmId" | "title" | "year">;

function summaryFromRow(
  film: MmFilmRef,
  row: {
    tmdb_id: number;
    title: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
  },
): FilmSummary {
  return {
    tmdbId: row.tmdb_id,
    sourceFilmId: film.filmId,
    title: row.title ?? film.title,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
  };
}

/**
 * Riassunti di **tutti** i film di una sala con una sola lettura di `cinema_films`.
 * Prima ogni film faceva la sua query (e il suo upsert): con ~15 film per sala e 5
 * sale erano ~75 andate e ritorno al DB per un solo render di `/cinema`.
 * I film non ancora in cache si cercano su TMDB in parallelo e si scrivono in un
 * unico upsert.
 */
export async function filmSummariesForMyMovies(
  films: MmFilmRef[],
): Promise<Map<number, FilmSummary>> {
  const result = new Map<number, FilmSummary>();
  if (films.length === 0) return result;

  const db = createServiceClient();
  const ids = [...new Set(films.map((f) => f.filmId))];
  const { data: rows, error: readError } = await db
    .from("cinema_films")
    .select("mymovies_film_id, tmdb_id, title, poster_path, backdrop_path")
    .in("mymovies_film_id", ids)
    .order("fetched_at", { ascending: false });
  if (readError) console.error("[cinema] errore lettura cinema_films:", readError);

  type FilmRow = NonNullable<typeof rows>[number];
  const byFilmId = new Map<number, FilmRow>();
  for (const row of rows ?? []) {
    // ordinate per fetched_at desc: la prima di ogni id è la più recente
    if (row.mymovies_film_id != null && !byFilmId.has(row.mymovies_film_id)) {
      byFilmId.set(row.mymovies_film_id, row);
    }
  }

  const missing: MmFilmRef[] = [];
  for (const film of films) {
    const row = byFilmId.get(film.filmId);
    if (row) result.set(film.filmId, summaryFromRow(film, row));
    else if (!result.has(film.filmId)) missing.push(film);
  }
  if (missing.length === 0) return result;

  const now = new Date().toISOString();
  const upserts = (
    await Promise.all(
      missing.map(async (film) => {
        const found = await searchMovie(film.title, film.year).catch(() => null);
        const wanted = normalizeTitle(film.title);
        const hit =
          found?.results.find((r) => normalizeTitle(r.title) === wanted) ??
          found?.results[0];
        if (!hit) {
          result.set(film.filmId, {
            tmdbId: null,
            sourceFilmId: film.filmId,
            title: film.title,
            posterPath: null,
            backdropPath: null,
          });
          return null;
        }
        result.set(film.filmId, {
          tmdbId: hit.id,
          sourceFilmId: film.filmId,
          title: hit.title,
          posterPath: hit.poster_path ?? null,
          backdropPath: hit.backdrop_path ?? null,
        });
        return {
          tmdb_id: hit.id,
          mymovies_film_id: film.filmId,
          title: hit.title,
          poster_path: hit.poster_path ?? null,
          backdrop_path: hit.backdrop_path ?? null,
          fetched_at: now,
        };
      }),
    )
  ).filter((u) => u !== null);

  if (upserts.length > 0) {
    const { error } = await db.from("cinema_films").upsert(upserts);
    if (error) console.error("[cinema] errore upsert cinema_films:", error);
  }
  return result;
}
