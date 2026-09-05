import "server-only";

import { getMovieList } from "@/lib/tmdb/client";
import type { TmdbMovieResult } from "@/lib/tmdb/types";
import { distanceKm, type LatLng } from "./geo";
import type {
  MgCinema,
  MgCinemaDetails,
  MgCinemaShowTimes,
  MgCinemasNearby,
  MgFilm,
  MgFilmShowTimes,
  MgFilmsNowShowing,
  MgShowings,
} from "./types";

/**
 * Dati finti per sviluppare senza chiave MovieGlu (`MOVIEGLU_MOCK=1`).
 * Tre cinema reali di Milano; i film sono i "now playing" TMDB con
 * `film_id` = id TMDB, così il match è diretto (vedi `match.ts`).
 */
const CINEMAS: MgCinema[] = [
  {
    cinema_id: 9001,
    cinema_name: "UCI Cinemas Bicocca",
    address: "Viale Sarca 336",
    city: "Milano",
    lat: 45.5228,
    lng: 9.2131,
    logo_url: null,
  },
  {
    cinema_id: 9002,
    cinema_name: "Anteo Palazzo del Cinema",
    address: "Piazza XXV Aprile 8",
    city: "Milano",
    lat: 45.4791,
    lng: 9.1884,
    logo_url: null,
  },
  {
    cinema_id: 9003,
    cinema_name: "The Space Cinema Odeon",
    address: "Via Santa Radegonda 8",
    city: "Milano",
    lat: 45.4656,
    lng: 9.1917,
    logo_url: null,
  },
];

const BASE_TIMES = ["15:30", "18:00", "20:45", "22:30"];

export interface MockFilm extends MgFilm {
  poster_path: string | null;
  backdrop_path: string | null;
}

async function films(): Promise<MockFilm[]> {
  const list = await getMovieList("now_playing").catch(() => null);
  return (list?.results ?? [])
    .filter((r): r is TmdbMovieResult => r.media_type === "movie")
    .slice(0, 6)
    .map((r) => ({
      film_id: r.id,
      film_name: r.title,
      imdb_title_id: null,
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
    }));
}

function withDistance(geo: LatLng): MgCinema[] {
  return CINEMAS.map((c) => ({
    ...c,
    distance: distanceKm(geo, { lat: c.lat!, lng: c.lng! }) / 1.609344,
  })).sort((a, b) => a.distance! - b.distance!);
}

/** Orari deterministici: sfasati di 15' per (film, cinema); IMAX solo alla Bicocca. */
function showingsFor(filmIndex: number, cinemaIndex: number): MgShowings {
  const shift = ((filmIndex + cinemaIndex) % 3) * 15;
  const times = BASE_TIMES.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const total = h * 60 + m + shift;
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    const endTotal = total + 125;
    const eh = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
    const em = String(endTotal % 60).padStart(2, "0");
    return { start_time: `${hh}:${mm}`, end_time: `${eh}:${em}` };
  });
  const out: MgShowings = { Standard: { times } };
  if (cinemaIndex === 0 && filmIndex % 2 === 0) {
    out.IMAX = { times: [{ start_time: "21:15", end_time: "23:20" }] };
  }
  return out;
}

export const mock = {
  async filmsNowShowing(): Promise<MgFilmsNowShowing> {
    return { films: await films() };
  },
  async cinemasNearby(geo: LatLng, n: number): Promise<MgCinemasNearby> {
    return { cinemas: withDistance(geo).slice(0, n) };
  },
  async filmShowTimes(geo: LatLng, filmId: number): Promise<MgFilmShowTimes | null> {
    const all = await films();
    const index = all.findIndex((f) => f.film_id === filmId);
    if (index < 0) return null;
    return {
      film: all[index],
      cinemas: withDistance(geo).map((c, i) => ({
        ...c,
        showings: showingsFor(index, i),
      })),
    };
  },
  async cinemaShowTimes(
    geo: LatLng,
    cinemaId: number,
  ): Promise<MgCinemaShowTimes | null> {
    const cinemas = withDistance(geo);
    const cinemaIndex = cinemas.findIndex((c) => c.cinema_id === cinemaId);
    if (cinemaIndex < 0) return null;
    const all = await films();
    return {
      // `distance` non è valido per questa rotta (cache condivisa fra utenti): azzerato
      // per non farlo usare per sbaglio a valle. Vedi commento su `cinemaShowTimes` in
      // movieglu.ts.
      cinema: { ...cinemas[cinemaIndex], distance: undefined },
      films: all.map((f, i) => ({ ...f, showings: showingsFor(i, cinemaIndex) })),
    };
  },
  async cinemaDetails(cinemaId: number): Promise<MgCinemaDetails | null> {
    const c = CINEMAS.find((x) => x.cinema_id === cinemaId);
    return c ? { ...c, website: null } : null;
  },
};
