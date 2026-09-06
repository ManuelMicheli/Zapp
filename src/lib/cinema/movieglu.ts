import "server-only";

import { unstable_cache } from "next/cache";
import { SHOWTIME_CACHE_TTL_MS } from "@/lib/config";
import { cellKey, roundToCell, type LatLng } from "./geo";
import { mock } from "./mock";
import { getCinemaSource } from "./source";
import type {
  MgCinemaDetails,
  MgCinemaShowTimes,
  MgCinemasNearby,
  MgFilmShowTimes,
  MgFilmsNowShowing,
} from "./types";

const BASE = "https://api-gate2.movieglu.com";
const REVALIDATE_S = SHOWTIME_CACHE_TTL_MS / 1000;

/**
 * MovieGlu vuole l'header `geolocation` su ogni chiamata, anche su quelle che non
 * dipendono dalla posizione (`filmsNowShowing`, `cinemaDetails`): per quelle si manda
 * il centro dell'Italia, così la chiave di cache resta unica.
 */
const IT_CENTROID: LatLng = { lat: 41.9028, lng: 12.4964 };

export function isMock(): boolean {
  return getCinemaSource() === "mock";
}

function credentials(): { client: string; key: string; auth: string } | null {
  const client = process.env.MOVIEGLU_CLIENT;
  const key = process.env.MOVIEGLU_API_KEY;
  const auth = process.env.MOVIEGLU_AUTHORIZATION;
  if (!client || !key || !auth) return null;
  if ([client, key, auth].some((v) => v.startsWith("INSERISCI"))) return null;
  return { client, key, auth };
}

// Throttle in memoria: 2 richieste al secondo (quota MovieGlu a consumo).
const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 2;
let windowStart = Date.now();
let windowCount = 0;

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount < MAX_PER_WINDOW) {
      windowCount += 1;
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - windowStart) + 5));
  }
}

let missingCredsLogged = false;

/**
 * GET su MovieGlu. Non solleva mai: `null` su 204 (nessun dato), errore di rete,
 * risposta non ok o credenziali mancanti. Chi chiama degrada.
 */
async function mgFetch<T>(
  path: string,
  params: Record<string, string>,
  geo: LatLng,
): Promise<T | null> {
  const creds = credentials();
  if (!creds) {
    if (!missingCredsLogged) {
      missingCredsLogged = true;
      console.error("[movieglu] credenziali mancanti in .env.local: sezione cinema off");
    }
    return null;
  }

  const url = new URL(`${BASE}/${path}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    client: creds.client,
    "x-api-key": creds.key,
    authorization: creds.auth,
    territory: "IT",
    "api-version": "v201",
    "device-datetime": new Date().toISOString(),
  };
  headers.geolocation = `${geo.lat};${geo.lng}`;

  await throttle();
  console.log(`[movieglu] fetch ${url.pathname}${url.search}`);
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 204) return null;
    if (!res.ok) {
      console.error(`[movieglu] ${res.status} su ${url.pathname}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("[movieglu] errore di rete:", e);
    return null;
  }
}

/**
 * Le funzioni sono avvolte in `unstable_cache` con chiave esplicita
 * (cella ~110 m + argomenti): la geolocation nell'header cambierebbe la chiave
 * del `fetch` cache a ogni metro.
 */
export const movieglu = {
  filmsNowShowing: unstable_cache(
    async (): Promise<MgFilmsNowShowing | null> => {
      if (isMock()) return mock.filmsNowShowing();
      return mgFetch<MgFilmsNowShowing>("filmsNowShowing", { n: "50" }, IT_CENTROID);
    },
    ["movieglu-films-now-showing"],
    { revalidate: 3600 },
  ),

  async cinemasNearby(geo: LatLng, n = 10): Promise<MgCinemasNearby | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemasNearby(cell, n);
        return mgFetch<MgCinemasNearby>("cinemasNearby", { n: String(n) }, cell);
      },
      ["movieglu-cinemas-nearby", cellKey(geo), String(n)],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  async filmShowTimes(
    geo: LatLng,
    filmId: number,
    date: string,
    n = 10,
  ): Promise<MgFilmShowTimes | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.filmShowTimes(cell, filmId);
        return mgFetch<MgFilmShowTimes>(
          "filmShowTimes",
          { film_id: String(filmId), date, n: String(n) },
          cell,
        );
      },
      ["movieglu-film-showtimes", cellKey(geo), String(filmId), date, String(n)],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  /**
   * Cache condivisa fra tutti gli utenti per (cinema, data): la programmazione di un
   * cinema non dipende da dove si trova chi la richiede. L'header `geolocation` viene
   * comunque inviato perché richiesto da MovieGlu, non per personalizzare la risposta.
   * Di conseguenza `cinema.distance` in questa risposta NON va usato: la distanza
   * corretta arriva da `cinemasNearby`.
   */
  async cinemaShowTimes(
    geo: LatLng,
    cinemaId: number,
    date: string,
  ): Promise<MgCinemaShowTimes | null> {
    const cell = roundToCell(geo);
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemaShowTimes(cell, cinemaId);
        return mgFetch<MgCinemaShowTimes>(
          "cinemaShowTimes",
          { cinema_id: String(cinemaId), date },
          cell,
        );
      },
      ["movieglu-cinema-showtimes", String(cinemaId), date],
      { revalidate: REVALIDATE_S },
    );
    return fn();
  },

  async cinemaDetails(cinemaId: number): Promise<MgCinemaDetails | null> {
    const fn = unstable_cache(
      async () => {
        if (isMock()) return mock.cinemaDetails(cinemaId);
        return mgFetch<MgCinemaDetails>(
          "cinemaDetails",
          { cinema_id: String(cinemaId) },
          IT_CENTROID,
        );
      },
      ["movieglu-cinema-details", String(cinemaId)],
      { revalidate: 30 * 24 * 3600 },
    );
    return fn();
  },
};
