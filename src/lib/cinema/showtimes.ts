import "server-only";

import * as legacy from "./movieglu-showtimes";
import * as mm from "./mymovies/showtimes";
import { getCinemaSource } from "./source";
import type { Cinema, CinemaGeo, CinemaShowtimes, ProgrammeFilm } from "./types";

/**
 * Facciata: stessa interfaccia per tutte le sorgenti. Con MyMovies `filmId` è l'id
 * film MyMovies e `date` è ignorata (solo oggi). `geo.provinceSlug` aiuta — è
 * l'elenco che si legge dal vivo — ma non è obbligatorio: senza, restano le sale già
 * note entro il raggio.
 */

/** Sale entro il raggio, per distanza; `n` limita (default: tutte, poi `rankCinemas`). */
export async function getNearbyCinemas(
  geo: CinemaGeo,
  n: number = Infinity,
): Promise<Cinema[]> {
  if (getCinemaSource() === "mymovies") {
    return mm.nearbyCinemas(geo, geo.provinceSlug ?? null, n);
  }
  return legacy.getNearbyCinemas(geo, Number.isFinite(n) ? n : 25);
}

export async function getFilmShowtimes(
  geo: CinemaGeo,
  filmId: number,
  filmName: string,
  date: string,
  originalTitle: string | null = null,
): Promise<CinemaShowtimes[]> {
  if (getCinemaSource() === "mymovies") {
    return mm.filmShowtimes(
      geo,
      geo.provinceSlug ?? null,
      filmId,
      filmName,
      originalTitle,
    );
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
