import "server-only";

import * as legacy from "./movieglu-showtimes";
import * as mm from "./mymovies/showtimes";
import { getCinemaSource } from "./source";
import type { Cinema, CinemaGeo, CinemaShowtimes, ProgrammeFilm } from "./types";

/**
 * Facciata: stessa interfaccia per tutte le sorgenti. Con MyMovies `filmId` è l'id
 * film MyMovies e `date` è ignorata (solo oggi); serve `geo.provinceSlug`.
 */
// Non "useMyMovies": eslint-plugin-react-hooks tratta ogni funzione "use*" come un hook.
function isMyMoviesGeo(geo: CinemaGeo): geo is CinemaGeo & { provinceSlug: string } {
  return getCinemaSource() === "mymovies" && !!geo.provinceSlug;
}

export async function getNearbyCinemas(geo: CinemaGeo, n = 10): Promise<Cinema[]> {
  if (getCinemaSource() === "mymovies") {
    return geo.provinceSlug ? mm.nearbyCinemas(geo, geo.provinceSlug, n) : [];
  }
  return legacy.getNearbyCinemas(geo, n);
}

export async function getFilmShowtimes(
  geo: CinemaGeo,
  filmId: number,
  filmName: string,
  date: string,
  originalTitle: string | null = null,
): Promise<CinemaShowtimes[]> {
  if (getCinemaSource() === "mymovies") {
    return isMyMoviesGeo(geo)
      ? mm.filmShowtimes(geo, geo.provinceSlug, filmId, filmName, originalTitle)
      : [];
  }
  return legacy.getFilmShowtimes(geo, filmId, filmName, date);
}

export async function getCinemaProgramme(
  geo: CinemaGeo,
  cinema: Cinema,
  date: string,
): Promise<ProgrammeFilm[]> {
  if (getCinemaSource() === "mymovies") return mm.cinemaProgramme(cinema);
  return legacy.getCinemaProgramme(geo, cinema, date);
}
