// Notorious Cinemas: JSON Webtic pubblici (parte pura, test Vitest).
// Livello 2 = frame scelta posti `seatsframe.php?sc=<cinema>&sp=<PerformanceId>`
// (200 senza login). Nessuna pagina film certa dai JSON: livello 1 assente, la
// cascata scende alla home della catena.

import { NOTORIOUS_BASE } from "@/lib/config";
import { bestByName, dateOf } from "./match";
import type { BookingLink, BookingQuery, ChainLinks } from "./types";

export interface NotoriousCinema {
  IDWEBTIC: string;
  DESCR: string;
}

export interface NotoriousPerformance {
  PerformanceId: number;
  /** "HH:MM" */
  Time: string;
}

export interface NotoriousEvent {
  EventId: number;
  Title: string;
  OriginalTitle: string | null;
  Days: { Day: string; Performances: NotoriousPerformance[] }[];
}

export interface NotoriousScheduling {
  DS: { Scheduling: { Events: NotoriousEvent[] } };
}

/** "NOTORIOUS CINEMAS SESTO SAN GIOVANNI" ↔ "Notorious Cinemas Sesto San Giovanni". */
export function pickNotoriousCinema(
  cinemas: NotoriousCinema[],
  name: string,
): NotoriousCinema | null {
  return bestByName(cinemas, (c) => c.DESCR, name);
}

export function pickNotoriousEvent(
  events: NotoriousEvent[],
  film: BookingQuery["film"],
): NotoriousEvent | null {
  // Prima il titolo italiano: "Cinemamma - Coyote Vs Acme" (evento speciale) ha lo
  // stesso OriginalTitle dello spettacolo normale e non deve vincere il pareggio.
  return (
    bestByName(events, (e) => e.Title, film.title) ??
    bestByName(events, (e) => e.OriginalTitle, film.title) ??
    (film.originalTitle
      ? (bestByName(events, (e) => e.Title, film.originalTitle) ??
        bestByName(events, (e) => e.OriginalTitle, film.originalTitle))
      : null)
  );
}

export function buildNotoriousLinks(
  cinemaId: string,
  event: NotoriousEvent,
  q: BookingQuery,
): ChainLinks {
  const byTime = new Map<string, BookingLink>();
  const day = event.Days.find((d) => dateOf(d.Day) === q.date);
  for (const time of q.times) {
    const p = day?.Performances.find((x) => x.Time === time);
    if (p) {
      byTime.set(time, {
        url: `${NOTORIOUS_BASE}/generic/seatsframe.php?sc=${encodeURIComponent(cinemaId)}&sp=${p.PerformanceId}#seatsframe`,
        level: 2,
      });
    }
  }
  return { byTime, fallback: null };
}
