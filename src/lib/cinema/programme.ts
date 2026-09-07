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
  /** La sala preferita che lo dà, altrimenti la prima in ordine di importanza. */
  cinema: Cinema;
  showings: Showing[];
  /** Quante sale vicine lo danno. */
  cinemaCount: number;
  /** Tutte le sale che lo danno, nell'ordine delle `venues` (preferiti, catene, …). */
  venues: CinemaShowtimes[];
}

/**
 * Chiave di un film fra sorgenti diverse: lo stesso titolo arriva da MyMovies (id
 * MyMovies) e dalle catene (id TMDB o hash del titolo) e deve contare come uno.
 */
export function filmKey(film: Pick<FilmSummary, "tmdbId" | "sourceFilmId">): string {
  return film.tmdbId != null ? `t${film.tmdbId}` : `s${film.sourceFilmId}`;
}

/**
 * Aggrega la programmazione delle sale per film: in testa il film dato in più sale;
 * per ogni film la sala preferita che lo dà, altrimenti la prima incontrata (le
 * `venues` arrivano già ordinate per importanza: preferiti, grandi catene, multisala,
 * indipendenti, poi distanza). `venues` di ogni film tiene tutte le sale, stesso ordine.
 */
export function aggregateByFilm(venues: VenueEntry[]): FilmEntry[] {
  const map = new Map<string, FilmEntry>();
  for (const { cinema, films } of venues) {
    for (const { film, showings } of films) {
      const key = filmKey(film);
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          film,
          cinema,
          showings,
          cinemaCount: 1,
          venues: [{ cinema, showings }],
        });
      } else {
        cur.cinemaCount += 1;
        cur.venues.push({ cinema, showings });
        if (!cur.cinema.favorite && cinema.favorite === true) {
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

export interface FilmWithNext {
  entry: FilmEntry;
  /** Il prossimo spettacolo del film nella sua sala. */
  next: Showing;
}

/**
 * I film che hanno ancora uno spettacolo oggi, nell'ordine di `aggregateByFilm`
 * (in testa quello dato in più sale), ciascuno col suo prossimo orario: è il giro
 * del banner in home (fondale + titolo + riga cambiano insieme).
 */
export function filmsWithNext(entries: FilmEntry[], nowMs: number): FilmWithNext[] {
  return entries.flatMap((entry) => {
    const next = entry.showings.find((s) => minutesUntil(s.start, nowMs) >= 0);
    return next ? [{ entry, next }] : [];
  });
}

export interface FilmOfTheDay extends FilmWithNext {
  /** Quanti altri film hanno ancora uno spettacolo oggi. */
  othersToday: number;
}

/**
 * Il film del giorno per il banner in home: il primo (= dato in più sale) che ha
 * ancora uno spettacolo, con il suo prossimo orario.
 */
export function filmOfTheDay(entries: FilmEntry[], nowMs: number): FilmOfTheDay | null {
  const withNext = filmsWithNext(entries, nowMs);
  const first = withNext[0];
  if (!first) return null;
  return { ...first, othersToday: withNext.length - 1 };
}
