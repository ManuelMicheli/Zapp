// Tipi raw MovieGlu v2 (solo i campi usati) e tipi pubblici dell'adapter cinema.

import type { LatLng } from "./geo";

export interface MgFilm {
  film_id: number;
  film_name: string;
  imdb_id?: number | string | null;
  /** "tt1234567" */
  imdb_title_id?: string | null;
  release_dates?: { release_date: string; notes?: string }[];
}

export interface MgCinema {
  cinema_id: number;
  cinema_name: string;
  address?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  /** Miglia dalla geolocation passata. */
  distance?: number;
  logo_url?: string | null;
}

export interface MgTime {
  /** "HH:MM" */
  start_time: string;
  end_time?: string;
}

/** Chiave = formato ("Standard", "3D", "IMAX", "IMAX 3D", …). */
export type MgShowings = Record<string, { film_id?: number; times: MgTime[] }>;

export interface MgFilmsNowShowing {
  films: MgFilm[];
}
export interface MgCinemasNearby {
  cinemas: MgCinema[];
}
export interface MgFilmShowTimes {
  film: MgFilm;
  cinemas: (MgCinema & { showings: MgShowings })[];
}
export interface MgCinemaShowTimes {
  cinema: MgCinema;
  films: (MgFilm & { showings: MgShowings })[];
}
export interface MgCinemaDetails extends MgCinema {
  website?: string | null;
}

// ---- tipi pubblici (serializzabili: passano ai client component) ----

export interface Cinema {
  id: number;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  logoUrl: string | null;
  /** Percorso pagina MyMovies (assente per le sorgenti legacy). */
  path?: string;
  /** True se è fra i cinema preferiti dell'utente (`orderCinemas`). */
  favorite?: boolean;
}

/** Posizione dell'utente con la provincia MyMovies (assente per le sorgenti legacy). */
export type CinemaGeo = LatLng & { provinceSlug?: string | null };

export interface Showing {
  /** ISO 8601 con offset di Roma. */
  start: string;
  end: string | null;
  /** "standard" | "3d" | "imax" | "imax3d" | altro normalizzato. */
  format: string;
  bookingUrl: string;
}

export interface FilmSummary {
  tmdbId: number | null;
  sourceFilmId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface CinemaShowtimes {
  cinema: Cinema;
  showings: Showing[];
}

export interface ProgrammeFilm {
  film: FilmSummary;
  showings: Showing[];
}
