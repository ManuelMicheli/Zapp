// Programmazione di un giorno dai JSON pubblici delle catene (parte pura, Vitest).
// MyMovies pubblica solo il programma di oggi: per domani e dopodomani gli orari
// vengono da qui, per le sale di UCI, Notorious e Cinelandia (The Space non espone gli
// orari). Ogni spettacolo porta già il link di acquisto della catena (livello 2).

import { normalizeFormat } from "../formats";
import { bestByName } from "./match";
import type { BookingQuery } from "./types";
import type { WebticEvent } from "./webtic";

export interface ChainShowing {
  /** "HH:MM" */
  time: string;
  /** "standard" | "vos" | "3d" | "imax" | … */
  format: string;
  url: string;
  level: 2 | 1;
}

export interface ChainFilm {
  title: string;
  originalTitle: string | null;
  showings: ChainShowing[];
}

function byTime(a: ChainShowing, b: ChainShowing): number {
  return a.time.localeCompare(b.time);
}

// ---- UCI ----

interface UciBlock {
  language?: { name?: string | null } | null;
  performances?: { starts_at?: unknown; cart_link?: unknown }[];
}

/** Chiave schermo UCI ("2D", "IMAX 3D") + lingua ("ITA", "ENG") → formato dell'app. */
export function uciFormat(
  screenKey: string,
  language: string | null | undefined,
): string {
  if (language && !/^ita/i.test(language)) return "vos";
  const f = normalizeFormat(screenKey);
  return f === "2d" || f === "" ? "standard" : f;
}

/**
 * Programmazione UCI di un giorno (`/theatres/{slug}/programming/{date}` senza
 * `movieSlug`): un film per voce, orari del giorno con il `cart_link` (livello 2).
 * `screens` è un array di oggetti chiave formato → blocchi con `performances`.
 */
export function uciDayProgramme(
  movies: { title: string; screens: unknown }[],
  date: string,
  siteBase: string,
): ChainFilm[] {
  const out: ChainFilm[] = [];
  for (const movie of movies) {
    const showings: ChainShowing[] = [];
    const screens = Array.isArray(movie.screens) ? movie.screens : [];
    for (const screen of screens) {
      if (screen === null || typeof screen !== "object") continue;
      for (const [key, blocks] of Object.entries(screen as Record<string, unknown>)) {
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks as UciBlock[]) {
          const format = uciFormat(key, block?.language?.name ?? null);
          for (const p of block?.performances ?? []) {
            if (typeof p.starts_at !== "string" || typeof p.cart_link !== "string")
              continue;
            const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(p.starts_at);
            if (!m || m[1] !== date) continue;
            const url = p.cart_link.startsWith("/") ? `${siteBase}${p.cart_link}` : null;
            if (!url) continue;
            showings.push({ time: m[2], format, url, level: 2 });
          }
        }
      }
    }
    if (showings.length > 0) {
      out.push({
        title: movie.title,
        originalTitle: null,
        showings: showings.sort(byTime),
      });
    }
  }
  return out;
}

// ---- Webtic (Notorious, Cinelandia) ----

/** "(Lingua Orig.) X" / "Cinemamma - X" → "X". */
export function webticBaseTitle(title: string): string {
  return title
    .replace(/^\s*\([^)]*\)\s*/, "")
    .replace(/^\s*cinemamma\s*-\s*/i, "")
    .replace(/\s+3d\s*$/i, "")
    .trim();
}

/** Formato dal titolo Webtic: "(Lingua Orig.)" → vos, "… 3D" → 3d, altrimenti standard. */
export function webticVariantFormat(title: string): string {
  if (/lingua orig|o\.v\.|sottotitol|\bvos\b|\bv\.o\./i.test(title)) return "vos";
  if (/\b3d\b/i.test(title)) return "3d";
  return "standard";
}

/**
 * Programmazione Webtic di un giorno (`getFullScheduling` porta tutti i giorni):
 * gli eventi con lo stesso titolo originale (la versione originale, la Cinemamma) si
 * fondono in un film con formati diversi. Ordine: primo evento incontrato.
 */
export function webticDayProgramme(
  events: WebticEvent[],
  date: string,
  performanceUrl: (eventId: number, performanceId: number) => string,
): ChainFilm[] {
  const films = new Map<string, ChainFilm>();
  for (const event of events) {
    const day = event.Days.find((d) => d.Day.startsWith(date));
    if (!day || day.Performances.length === 0) continue;
    const format = webticVariantFormat(event.Title);
    const base = webticBaseTitle(event.Title);
    const key = (event.OriginalTitle ?? base).toLowerCase();
    const showings = day.Performances.map<ChainShowing>((p) => ({
      time: p.Time,
      format,
      url: performanceUrl(event.EventId, p.PerformanceId),
      level: 2,
    }));
    const cur = films.get(key);
    if (!cur) {
      films.set(key, { title: base, originalTitle: event.OriginalTitle, showings });
    } else {
      cur.showings.push(...showings);
      // la variante non porta il titolo: "Coyote Vs Acme" batte "(Lingua Orig.) …"
      if (format === "standard" && cur.title !== base && !/\(/.test(event.Title)) {
        cur.title = base;
      }
    }
  }
  for (const f of films.values()) f.showings.sort(byTime);
  return [...films.values()];
}

/** Il film della programmazione che corrisponde al titolo TMDB (italiano o originale). */
export function pickChainFilm(
  films: ChainFilm[],
  film: BookingQuery["film"],
): ChainFilm | null {
  const names = (f: ChainFilm) => [f.title, f.originalTitle];
  return (
    bestByName(films, names, film.title) ??
    (film.originalTitle ? bestByName(films, names, film.originalTitle) : null)
  );
}
