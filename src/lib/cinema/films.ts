import type { MgFilm } from "./types";

/** Cerca il film MovieGlu con lo stesso IMDb id ("tt1234567") di TMDB. */
export function matchFilmByImdb(films: MgFilm[], imdbId: string | null): MgFilm | null {
  if (!imdbId) return null;
  const numeric = Number(imdbId.replace(/^tt/, ""));
  return (
    films.find(
      (f) =>
        f.imdb_title_id === imdbId ||
        (f.imdb_id != null && Number(f.imdb_id) === numeric),
    ) ?? null
  );
}
