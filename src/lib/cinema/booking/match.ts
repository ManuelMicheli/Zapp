// Match puri fra i dati MyMovies (nome cinema, titolo TMDB, orario) e gli elenchi
// delle catene. Test in match.test.ts.

import { BOOKING_VENUE_MAX_KM } from "@/lib/config";
import { normalizeTitle, titleSimilarity } from "@/lib/import/netflix-title";
import { distanceKm, isValidLatLng, type LatLng } from "../geo";

/** Soglia di somiglianza per titoli e nomi cinema (come il matcher Netflix). */
export const BOOKING_MATCH_THRESHOLD = 0.85;

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Il cinema più vicino alle coordinate MyMovies, entro `maxKm` (default 500 m):
 * le catene con coordinate (UCI) si riconoscono così, senza fidarsi dei nomi.
 * Le coordinate possono arrivare come stringhe.
 */
export function nearestVenue<T extends { lat: unknown; lng: unknown }>(
  list: T[],
  geo: LatLng,
  maxKm: number = BOOKING_VENUE_MAX_KM,
): T | null {
  let best: { item: T; km: number } | null = null;
  for (const item of list) {
    const lat = toNumber(item.lat);
    const lng = toNumber(item.lng);
    if (lat === null || lng === null || !isValidLatLng(lat, lng)) continue;
    const km = distanceKm(geo, { lat, lng });
    if (km <= maxKm && (!best || km < best.km)) best = { item, km };
  }
  return best?.item ?? null;
}

/**
 * L'elemento il cui nome (o uno dei nomi) somiglia di più a `wanted`, sopra la
 * soglia; a parità vince il primo. Riusa `titleSimilarity` del matcher Netflix.
 */
export function bestByName<T>(
  list: T[],
  name: (item: T) => string | (string | null | undefined)[],
  wanted: string,
  threshold: number = BOOKING_MATCH_THRESHOLD,
): T | null {
  let best: { item: T; score: number } | null = null;
  for (const item of list) {
    const raw = name(item);
    const names = (Array.isArray(raw) ? raw : [raw]).filter(
      (n): n is string => typeof n === "string" && n.trim() !== "",
    );
    for (const n of names) {
      const score = titleSimilarity(wanted, n);
      if (score >= threshold && (!best || score > best.score)) best = { item, score };
    }
  }
  return best?.item ?? null;
}

/**
 * L'elemento il cui token (es. `cinemaName` "rozzano" di The Space) compare come
 * parola nel nome MyMovies ("The Space Cinema Rozzano"). Token più lungo vince.
 */
export function bestByToken<T>(
  list: T[],
  token: (item: T) => string,
  cinemaName: string,
): T | null {
  const words = new Set(normalizeTitle(cinemaName).split(" "));
  let best: { item: T; len: number } | null = null;
  for (const item of list) {
    const t = normalizeTitle(token(item));
    if (!t) continue;
    const ok = t.split(" ").every((w) => words.has(w));
    if (ok && (!best || t.length > best.len)) best = { item, len: t.length };
  }
  return best?.item ?? null;
}

/** "HH:MM" da ISO ("…T21:15:00+02:00"), da "YYYY-MM-DD HH:MM:SS" o da "H:MM"; null se assente. */
export function hhmm(value: string): string | null {
  const m = /(?:^|[T\s])(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** "YYYY-MM-DD" iniziale di una data ISO o "YYYY-MM-DD HH:MM"; null se assente. */
export function dateOf(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}
