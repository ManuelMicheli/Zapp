import "server-only";

import {
  BOOKING_SCHEDULE_TTL_S,
  BOOKING_VENUES_TTL_S,
  NOTORIOUS_BASE,
  UCI_API_BASE,
  UCI_SITE_BASE,
  WEBTIC_API_BASE,
} from "@/lib/config";
import { chainFor } from "../chains";
import { pickCinelandiaVenue } from "./cinelandia";
import { uciDayProgramme, webticDayProgramme, type ChainFilm } from "./day";
import { fetchJson } from "./fetch";
import { pickNotoriousCinema, type NotoriousCinema } from "./notorious";
import type { BookingQuery } from "./types";
import { pickUciTheatre, type UciTheatre } from "./uci";
import {
  webticPerformanceUrl,
  webticSchedulingBody,
  type WebticScheduling,
} from "./webtic";

type CinemaRef = BookingQuery["cinema"];

/** Catene che pubblicano gli orari dei prossimi giorni (The Space no). */
export function chainHasProgramme(cinemaName: string): boolean {
  const chain = chainFor(cinemaName)?.name;
  return (
    chain === "UCI Cinemas" || chain === "Notorious Cinemas" || chain === "Cinelandia"
  );
}

async function uciProgramme(
  cinema: CinemaRef,
  date: string,
): Promise<ChainFilm[] | null> {
  const theatres = await fetchJson<{ data: UciTheatre[] }>(
    `${UCI_API_BASE}/theatres`,
    BOOKING_VENUES_TTL_S,
  );
  const theatre = theatres ? pickUciTheatre(theatres.data ?? [], cinema) : null;
  if (!theatre) return null;
  const programming = await fetchJson<{ data: { title: string; screens: unknown }[] }>(
    `${UCI_API_BASE}/theatres/${theatre.slug}/programming/${date}`,
    BOOKING_SCHEDULE_TTL_S,
  );
  if (!programming) return null;
  return uciDayProgramme(programming.data ?? [], date, UCI_SITE_BASE);
}

const NOTORIOUS_HEADERS = {
  Referer: `${NOTORIOUS_BASE}/`,
  "X-Requested-With": "XMLHttpRequest",
};

async function notoriousProgramme(
  cinema: CinemaRef,
  date: string,
): Promise<ChainFilm[] | null> {
  const cinemas = await fetchJson<NotoriousCinema[]>(
    `${NOTORIOUS_BASE}/cvu/modules/prenoRapido.php?sel=getCinema`,
    BOOKING_VENUES_TTL_S,
    { headers: NOTORIOUS_HEADERS },
  );
  const hit = Array.isArray(cinemas) ? pickNotoriousCinema(cinemas, cinema.name) : null;
  if (!hit) return null;
  const sched = await fetchJson<WebticScheduling>(
    `${NOTORIOUS_BASE}/cvu/modules/prenoRapido.php?sel=getFullSched&idcine=${encodeURIComponent(hit.IDWEBTIC)}`,
    BOOKING_SCHEDULE_TTL_S,
    { headers: NOTORIOUS_HEADERS },
  );
  const events = sched?.DS?.Scheduling?.Events;
  if (!Array.isArray(events)) return null;
  const sc = encodeURIComponent(hit.IDWEBTIC);
  return webticDayProgramme(
    events,
    date,
    (eventId, performanceId) =>
      `${NOTORIOUS_BASE}/generic/seatsframe.php?sc=${sc}&se=${eventId}&sp=${performanceId}#seatsframe`,
  );
}

async function cinelandiaProgramme(
  cinema: CinemaRef,
  date: string,
): Promise<ChainFilm[] | null> {
  const venue = pickCinelandiaVenue(cinema.name);
  if (!venue) return null;
  const sched = await fetchJson<WebticScheduling>(
    `${WEBTIC_API_BASE}/Webtic/CallOldWebtic`,
    BOOKING_SCHEDULE_TTL_S,
    { body: webticSchedulingBody(venue.localId) },
  );
  const events = sched?.DS?.Scheduling?.Events;
  if (!Array.isArray(events)) return null;
  return webticDayProgramme(events, date, (e, p) =>
    webticPerformanceUrl(venue.localId, e, p),
  );
}

/**
 * Programmazione di un cinema di catena in un giorno ("YYYY-MM-DD", Roma), dai JSON
 * pubblici già usati per i link biglietteria (stessa cache, 30 min). `null` se il
 * cinema non è di una catena con orari o un passo fallisce. Mai un'eccezione.
 */
export async function getChainProgramme(
  cinema: CinemaRef,
  date: string,
): Promise<ChainFilm[] | null> {
  const chain = chainFor(cinema.name);
  if (!chain) return null;
  try {
    switch (chain.name) {
      case "UCI Cinemas":
        return await uciProgramme(cinema, date);
      case "Notorious Cinemas":
        return await notoriousProgramme(cinema, date);
      case "Cinelandia":
        return await cinelandiaProgramme(cinema, date);
      default:
        return null;
    }
  } catch (e) {
    console.error(
      `[booking] programma ${chain.name} ${cinema.name} ${date}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
