import "server-only";

import {
  BOOKING_FILMS_TTL_S,
  BOOKING_SCHEDULE_TTL_S,
  BOOKING_VENUES_TTL_S,
  CINELANDIA_BASE,
  NOTORIOUS_BASE,
  THESPACE_BASE,
  UCI_API_BASE,
} from "@/lib/config";
import { chainFor } from "../chains";
import { buildCinelandiaLinks, cinelandiaSlug, type CinelandiaPage } from "./cinelandia";
import { fetchJson } from "./fetch";
import {
  buildNotoriousLinks,
  pickNotoriousCinema,
  pickNotoriousEvent,
  type NotoriousCinema,
  type NotoriousScheduling,
} from "./notorious";
import {
  buildTheSpaceLinks,
  pickTheSpaceCinema,
  pickTheSpaceFilm,
  type TheSpaceCinemas,
  type TheSpaceFilms,
} from "./thespace";
import type { BookingQuery, ChainLinks } from "./types";
import {
  buildUciLinks,
  flattenUciPerformances,
  pickUciMovie,
  pickUciTheatre,
  type UciMovie,
  type UciProgramming,
  type UciTheatre,
} from "./uci";

async function resolveUci(q: BookingQuery): Promise<ChainLinks | null> {
  const theatres = await fetchJson<{ data: UciTheatre[] }>(
    `${UCI_API_BASE}/theatres`,
    BOOKING_VENUES_TTL_S,
  );
  const theatre = theatres ? pickUciTheatre(theatres.data ?? [], q.cinema) : null;
  if (!theatre) return null;
  const movies = await fetchJson<{ data: UciMovie[] }>(
    `${UCI_API_BASE}/movies`,
    BOOKING_FILMS_TTL_S,
  );
  const movie = movies ? pickUciMovie(movies.data ?? [], q.film) : null;
  if (!movie) return buildUciLinks(theatre, [], q);
  const programming = await fetchJson<UciProgramming>(
    `${UCI_API_BASE}/theatres/${theatre.slug}/programming/${q.date}?movieSlug=${encodeURIComponent(movie.slug)}`,
    BOOKING_SCHEDULE_TTL_S,
  );
  const entry =
    programming?.data?.find((m) => m.slug === movie.slug) ?? programming?.data?.[0];
  return buildUciLinks(theatre, entry ? flattenUciPerformances(entry.screens) : [], q);
}

// prenoRapido.php risponde vuoto senza questi header (verificato 2026-09-06).
const NOTORIOUS_HEADERS = {
  Referer: `${NOTORIOUS_BASE}/`,
  "X-Requested-With": "XMLHttpRequest",
};

async function resolveNotorious(q: BookingQuery): Promise<ChainLinks | null> {
  const cinemas = await fetchJson<NotoriousCinema[]>(
    `${NOTORIOUS_BASE}/cvu/modules/prenoRapido.php?sel=getCinema`,
    BOOKING_VENUES_TTL_S,
    NOTORIOUS_HEADERS,
  );
  const cinema = Array.isArray(cinemas)
    ? pickNotoriousCinema(cinemas, q.cinema.name)
    : null;
  if (!cinema) return null;
  const sched = await fetchJson<NotoriousScheduling>(
    `${NOTORIOUS_BASE}/cvu/modules/prenoRapido.php?sel=getFullSched&idcine=${encodeURIComponent(cinema.IDWEBTIC)}`,
    BOOKING_SCHEDULE_TTL_S,
    NOTORIOUS_HEADERS,
  );
  const events = sched?.DS?.Scheduling?.Events;
  const event = Array.isArray(events) ? pickNotoriousEvent(events, q.film) : null;
  if (!event) return null;
  return buildNotoriousLinks(cinema.IDWEBTIC, event, q);
}

async function resolveTheSpace(q: BookingQuery): Promise<ChainLinks | null> {
  const cinemas = await fetchJson<TheSpaceCinemas>(
    `${THESPACE_BASE}/api/microservice/showings/cinemas`,
    BOOKING_VENUES_TTL_S,
  );
  const cinema = cinemas ? pickTheSpaceCinema(cinemas.result ?? [], q.cinema.name) : null;
  if (!cinema) return null;
  const films = await fetchJson<TheSpaceFilms>(
    `${THESPACE_BASE}/api/microservice/showings/films`,
    BOOKING_FILMS_TTL_S,
  );
  const film = films ? pickTheSpaceFilm(films.result ?? [], q.film) : null;
  return buildTheSpaceLinks(cinema, film);
}

async function resolveCinelandia(q: BookingQuery): Promise<ChainLinks | null> {
  const slug = cinelandiaSlug(q.film.title);
  if (!slug) return null;
  const pages = await fetchJson<CinelandiaPage[]>(
    `${CINELANDIA_BASE}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id,slug`,
    BOOKING_FILMS_TTL_S,
  );
  return buildCinelandiaLinks(Array.isArray(pages) ? pages : [], slug);
}

/**
 * Link della catena per un film in un cinema (per orario dove la catena espone lo
 * spettacolo). `null` se il cinema non è di una catena nota o un passo fallisce:
 * chi chiama scende alla cascata generica. Mai un'eccezione.
 */
export async function resolveChainLinks(q: BookingQuery): Promise<ChainLinks | null> {
  const chain = chainFor(q.cinema.name);
  if (!chain) return null;
  try {
    switch (chain.name) {
      case "UCI Cinemas":
        return await resolveUci(q);
      case "The Space Cinema":
        return await resolveTheSpace(q);
      case "Notorious Cinemas":
        return await resolveNotorious(q);
      case "Cinelandia":
        return await resolveCinelandia(q);
      default:
        return null;
    }
  } catch (e) {
    console.error(
      `[booking] ${chain.name} ${q.cinema.name}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
