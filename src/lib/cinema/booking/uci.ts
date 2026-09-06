// UCI Cinemas: costruzione dei link dai JSON pubblici (parte pura, test Vitest).
// Livello 2 = `cart_link` della performance (→ login UCI, poi carrello);
// livello 1 = pagina del cinema (programmazione di oggi).

import { UCI_SITE_BASE } from "@/lib/config";
import { bestByName, dateOf, hhmm, nearestVenue } from "./match";
import type { BookingLink, BookingQuery, ChainLinks } from "./types";

export interface UciTheatre {
  id: number;
  name: string;
  slug: string;
  latitude: string | number | null;
  longitude: string | number | null;
}

export interface UciMovie {
  id: number;
  title: string;
  slug: string;
}

export interface UciPerformance {
  id: number;
  /** "YYYY-MM-DD HH:MM:SS" (ora locale del cinema). */
  starts_at: string;
  cart_link: string;
}

/** Programmazione di un cinema: film → schermi → formato → proiezioni. */
export interface UciProgramming {
  data: { slug: string; screens: unknown }[];
}

export function pickUciTheatre(
  theatres: UciTheatre[],
  cinema: BookingQuery["cinema"],
): UciTheatre | null {
  const byGeo = nearestVenue(
    theatres.map((t) => ({ t, lat: t.latitude, lng: t.longitude })),
    cinema,
  );
  if (byGeo) return byGeo.t;
  // senza coordinate: "UCI Cinemas Bicocca | Milano" contro "UCI Cinemas Bicocca"
  return bestByName(theatres, (t) => [t.name, t.name.split("|")[0]], cinema.name);
}

export function pickUciMovie(
  movies: UciMovie[],
  film: BookingQuery["film"],
): UciMovie | null {
  return (
    bestByName(movies, (m) => m.title, film.title) ??
    (film.originalTitle ? bestByName(movies, (m) => m.title, film.originalTitle) : null)
  );
}

function isPerformance(v: unknown): v is UciPerformance {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as UciPerformance).starts_at === "string" &&
    typeof (v as UciPerformance).cart_link === "string"
  );
}

/** Raccoglie ogni array `performances` annidato in `screens`, qualunque sia la forma. */
export function flattenUciPerformances(screens: unknown): UciPerformance[] {
  const out: UciPerformance[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 6 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.performances)) {
      for (const p of obj.performances) if (isPerformance(p)) out.push(p);
      return;
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(screens, 0);
  return out;
}

export function buildUciLinks(
  theatre: UciTheatre,
  performances: UciPerformance[],
  q: BookingQuery,
): ChainLinks {
  const byTime = new Map<string, BookingLink>();
  for (const time of q.times) {
    const p = performances.find(
      (x) => dateOf(x.starts_at) === q.date && hhmm(x.starts_at) === time,
    );
    if (p && p.cart_link.startsWith("/")) {
      byTime.set(time, { url: `${UCI_SITE_BASE}${p.cart_link}`, level: 2 });
    }
  }
  return {
    byTime,
    fallback: { url: `${UCI_SITE_BASE}/cinema/${theatre.slug}`, level: 1 },
  };
}
