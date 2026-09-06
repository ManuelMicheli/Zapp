// Webtic (Crea Informatica): biglietteria usata da Notorious, Cinelandia e molte sale
// indipendenti. Formato di programmazione condiviso (`getFullScheduling`) e frame di
// acquisto `secure.webtic.it/angwt/webtic.aspx#/…`: `/shoppingmode/…/{performance}`
// = acquisto dello spettacolo (chiede il login Webtic, poi prosegue),
// `/event/…/{event}` = film nel cinema con gli orari, senza login. Parte pura, Vitest.

import { WEBTIC_SECURE_BASE } from "@/lib/config";
import { titleSimilarity } from "@/lib/import/netflix-title";
import { BOOKING_MATCH_THRESHOLD, dateOf } from "./match";
import type { BookingLink, BookingQuery, ChainLinks } from "./types";

export interface WebticPerformance {
  PerformanceId: number;
  /** "HH:MM" */
  Time: string;
}

export interface WebticEvent {
  EventId: number;
  Title: string;
  OriginalTitle: string | null;
  Days: { Day: string; Performances: WebticPerformance[] }[];
}

export interface WebticScheduling {
  DS: { Scheduling: { LocalId?: number; Events: WebticEvent[] } };
}

/** Corpo della chiamata pubblica `POST restapi.webtic.it/Webtic/CallOldWebtic`. */
export function webticSchedulingBody(localId: number | string, trackId = 33): string {
  return JSON.stringify({
    OldWebticRequest: {
      meta: {
        QueryParams: {
          wtid: "getFullScheduling",
          localid: Number(localId),
          trackid: trackId,
        },
      },
    },
  });
}

/** Varianti dello stesso film ("(Lingua Orig.) …", "Cinemamma - …"): a parità perdono. */
const VARIANT_RE = /\(|lingua orig|o\.v\.|cinemamma|sottotitol/i;
const VARIANT_PENALTY = 0.05;

function pickBy(
  events: WebticEvent[],
  name: (e: WebticEvent) => string | null,
  wanted: string,
): WebticEvent | null {
  let best: { event: WebticEvent; score: number } | null = null;
  for (const event of events) {
    const n = name(event);
    if (!n) continue;
    let score = titleSimilarity(wanted, n);
    if (VARIANT_RE.test(n)) score -= VARIANT_PENALTY;
    if (score >= BOOKING_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { event, score };
    }
  }
  return best?.event ?? null;
}

/**
 * Evento (film) della programmazione: prima il titolo italiano, poi l'originale.
 * `normalizeTitle` toglie le parentesi, quindi "(Lingua Orig.) Coyote Vs Acme" farebbe
 * pareggio con "Coyote Vs Acme": le varianti pagano una piccola penalità.
 */
export function pickWebticEvent(
  events: WebticEvent[],
  film: BookingQuery["film"],
): WebticEvent | null {
  return (
    pickBy(events, (e) => e.Title, film.title) ??
    pickBy(events, (e) => e.OriginalTitle, film.title) ??
    (film.originalTitle
      ? (pickBy(events, (e) => e.Title, film.originalTitle) ??
        pickBy(events, (e) => e.OriginalTitle, film.originalTitle))
      : null)
  );
}

const frameBase = (localId: number | string) =>
  `${WEBTIC_SECURE_BASE}/angwt/webtic.aspx?lng=it&lid=${encodeURIComponent(String(localId))}&tpl=default&kid=1`;

/** Acquisto dello spettacolo (login Webtic, poi scelta posti). */
export function webticPerformanceUrl(
  localId: number | string,
  eventId: number,
  performanceId: number,
): string {
  return `${frameBase(localId)}#/shoppingmode/it/1/${localId}/${eventId}/${performanceId}`;
}

/** Film nel cinema con gli orari, senza login. */
export function webticEventUrl(localId: number | string, eventId: number): string {
  return `${frameBase(localId)}#/event/it/1/${localId}/${eventId}`;
}

/**
 * Link per orario dalla programmazione Webtic. `performanceUrl` è sovrascrivibile
 * (Notorious usa la propria pagina che incapsula il frame); il fallback è la pagina
 * evento Webtic (livello 1).
 */
export function buildWebticLinks(
  localId: number | string,
  event: WebticEvent,
  q: BookingQuery,
  performanceUrl: (eventId: number, performanceId: number) => string = (e, p) =>
    webticPerformanceUrl(localId, e, p),
): ChainLinks {
  const byTime = new Map<string, BookingLink>();
  const day = event.Days.find((d) => dateOf(d.Day) === q.date);
  for (const time of q.times) {
    const p = day?.Performances.find((x) => x.Time === time);
    if (p)
      byTime.set(time, { url: performanceUrl(event.EventId, p.PerformanceId), level: 2 });
  }
  return { byTime, fallback: { url: webticEventUrl(localId, event.EventId), level: 1 } };
}
