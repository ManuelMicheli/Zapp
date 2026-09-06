// Programmazione di oggi: funzioni pure (test Vitest) condivise dalla pagina /cinema,
// dal banner "Al cinema oggi" in home e dalla sezione nella scheda film.

import { minutesUntil } from "./dates";
import type {
  Cinema,
  CinemaShowtimes,
  FilmSummary,
  ProgrammeFilm,
  Showing,
} from "./types";

export interface VenueEntry {
  cinema: Cinema;
  films: ProgrammeFilm[];
}

export interface FilmEntry {
  film: FilmSummary;
  /** La sala preferita che lo dà, altrimenti la più vicina, con i suoi orari. */
  cinema: Cinema;
  showings: Showing[];
  /** Quante sale vicine lo danno. */
  cinemaCount: number;
}

/**
 * Aggrega la programmazione delle sale per film: in testa il film dato in più sale;
 * per ogni film la sala preferita che lo dà, altrimenti la più vicina.
 */
export function aggregateByFilm(venues: VenueEntry[]): FilmEntry[] {
  const map = new Map<number, FilmEntry>();
  for (const { cinema, films } of venues) {
    for (const { film, showings } of films) {
      const cur = map.get(film.sourceFilmId);
      if (!cur) {
        map.set(film.sourceFilmId, { film, cinema, showings, cinemaCount: 1 });
      } else {
        cur.cinemaCount += 1;
        const better =
          !cur.cinema.favorite &&
          (cinema.favorite === true || cinema.distanceKm < cur.cinema.distanceKm);
        if (better) {
          cur.cinema = cinema;
          cur.showings = showings;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.cinemaCount - a.cinemaCount);
}

export interface NextShowing {
  cinema: Cinema;
  showing: Showing;
}

/** Il primo spettacolo futuro fra tutte le sale (a parità di orario la prima in lista). */
export function nextShowing(items: CinemaShowtimes[], nowMs: number): NextShowing | null {
  let best: NextShowing | null = null;
  for (const { cinema, showings } of items) {
    for (const showing of showings) {
      if (minutesUntil(showing.start, nowMs) < 0) continue;
      if (!best || showing.start < best.showing.start) best = { cinema, showing };
    }
  }
  return best;
}

export interface FilmOfTheDay {
  entry: FilmEntry;
  /** Il prossimo spettacolo del film nella sua sala. */
  next: Showing;
  /** Quanti altri film hanno ancora uno spettacolo oggi. */
  othersToday: number;
}

/**
 * Il film del giorno per il banner in home: il primo (= dato in più sale) che ha
 * ancora uno spettacolo, con il suo prossimo orario.
 */
export function filmOfTheDay(entries: FilmEntry[], nowMs: number): FilmOfTheDay | null {
  const withNext = entries
    .map((entry) => ({
      entry,
      next: entry.showings.find((s) => minutesUntil(s.start, nowMs) >= 0) ?? null,
    }))
    .filter((e): e is { entry: FilmEntry; next: Showing } => e.next !== null);
  const first = withNext[0];
  if (!first) return null;
  return { ...first, othersToday: withNext.length - 1 };
}
