import "server-only";

import { cache } from "react";
import type { TitleRow } from "@/lib/tmdb/mappers";
import { chainHasProgramme, getChainProgramme, type ChainShowing } from "./booking";
import { pickChainFilm } from "./booking/day";
import { nextDays, romeDateString, romeIso, type DayOption } from "./dates";
import { orderCinemas, orderShowtimes } from "./favorites";
import { getSourceFilmId } from "./match";
import { aggregateByFilm, type FilmEntry, type VenueEntry } from "./programme";
import { getFavoriteCinemaIds, getViewerLocation, type ViewerLocation } from "./queries";
import { getCinemaProgramme, getFilmShowtimes, getNearbyCinemas } from "./showtimes";
import { filmSummaryByTitle } from "./summary";
import type { Cinema, CinemaShowtimes, ProgrammeFilm, Showing } from "./types";

/** Giorni mostrati: oggi, domani, dopodomani. */
export const CINEMA_DAYS = 3;

/** Le opzioni giorno di oggi (Roma). */
export function cinemaDays(): DayOption[] {
  return nextDays(CINEMA_DAYS);
}

/** `?day=` valido solo se è uno dei giorni mostrati; altrimenti oggi. */
export function resolveDay(param: string | undefined, days: DayOption[]): DayOption {
  return days.find((d) => d.date === param) ?? days[0];
}

function chainShowings(date: string, showings: ChainShowing[]): Showing[] {
  return showings.map((s) => ({
    start: romeIso(date, s.time),
    end: null,
    format: s.format,
    bookingUrl: s.url,
    bookingLevel: s.level,
  }));
}

/**
 * Programma di una sala in un giorno. Oggi: MyMovies; se MyMovies non ha nulla (di
 * notte il programma del giorno non è ancora pubblicato) o il giorno è futuro, il
 * JSON della catena (UCI, Notorious, Cinelandia). Sale indipendenti: solo oggi.
 */
async function venueFilms(
  location: ViewerLocation,
  cinema: Cinema,
  date: string,
  today: string,
  /** Salta MyMovies: sala di catena oltre le prime 5, basta il JSON della catena. */
  chainOnly = false,
): Promise<ProgrammeFilm[]> {
  if (date === today && !chainOnly) {
    const mm = await getCinemaProgramme(location, cinema, date).catch(() => []);
    if (mm.length > 0) return mm;
  }
  if (!chainHasProgramme(cinema.name)) return [];
  const chain = await getChainProgramme(cinema, date);
  if (!chain) return [];
  return Promise.all(
    chain.map(async (f) => ({
      film: await filmSummaryByTitle(f.title, f.originalTitle),
      showings: chainShowings(date, f.showings),
    })),
  );
}

export interface DayProgramme {
  date: string;
  /** Le 10 sale più vicine, preferiti in testa. */
  cinemas: Cinema[];
  /** Le prime 5 (più le sale di catena fra le 10) con almeno un film quel giorno. */
  venues: VenueEntry[];
  /** Per film, dato in più sale prima. */
  films: FilmEntry[];
}

/**
 * Programmazione di un giorno vicino all'utente, condivisa da `/cinema` e dal banner
 * in home (React `cache()` per data: una sola lettura per richiesta). Preferiti in
 * testa: il programma si carica per le prime 5 sale, così gli orari dei preferiti
 * arrivano sempre. Senza posizione o provincia → vuoto.
 */
export const getDayProgramme = cache(async (date: string): Promise<DayProgramme> => {
  const [location, favIds] = await Promise.all([
    getViewerLocation(),
    getFavoriteCinemaIds(),
  ]);
  if (!location?.provinceSlug) return { date, cinemas: [], venues: [], films: [] };
  const today = romeDateString();
  const cinemas = orderCinemas(
    await getNearbyCinemas(location, 10).catch(() => []),
    favIds,
  );
  // Le prime 5 sale (MyMovies) più ogni sala di catena fra le 10: il JSON della catena
  // è una chiamata in cache, e senza di loro un centro città di sale indipendenti non
  // avrebbe nulla per domani.
  const programmes = await Promise.all(
    cinemas
      .map((cinema, i) => ({ cinema, chainOnly: i >= 5 }))
      .filter(({ cinema, chainOnly }) => !chainOnly || chainHasProgramme(cinema.name))
      .map(async ({ cinema, chainOnly }) => ({
        cinema,
        films: await venueFilms(location, cinema, date, today, chainOnly),
      })),
  );
  const venues = programmes.filter((v) => v.films.length > 0);
  return { date, cinemas, venues, films: aggregateByFilm(venues) };
});

export interface FilmDay extends DayOption {
  items: CinemaShowtimes[];
}

/**
 * Le sale che danno un film in un giorno. Oggi: la pagina film-in-provincia di
 * MyMovies (tutte le sale) più, per le sale di catena vicine che MyMovies non elenca,
 * il JSON della catena; giorni futuri: solo le catene. Preferiti in testa.
 */
async function filmShowtimesForDay(
  location: ViewerLocation & { provinceSlug: string },
  title: TitleRow,
  sourceId: number | null,
  nearby: Cinema[],
  date: string,
  today: string,
  favIds: number[],
): Promise<CinemaShowtimes[]> {
  const mm =
    date === today && sourceId != null
      ? await getFilmShowtimes(
          location,
          sourceId,
          title.title,
          date,
          title.original_title,
        ).catch(() => [])
      : [];
  const seen = new Set(mm.map((i) => i.cinema.id));
  const film = { title: title.title, originalTitle: title.original_title };
  const extra = await Promise.all(
    nearby
      .filter((c) => !seen.has(c.id) && chainHasProgramme(c.name))
      .map(async (cinema): Promise<CinemaShowtimes | null> => {
        const prog = await getChainProgramme(cinema, date);
        const hit = prog ? pickChainFilm(prog, film) : null;
        return hit ? { cinema, showings: chainShowings(date, hit.showings) } : null;
      }),
  );
  return orderShowtimes(
    [...mm, ...extra.filter((x): x is CinemaShowtimes => x !== null)],
    favIds,
  );
}

/** Gli orari di un film nei prossimi `CINEMA_DAYS` giorni (in parallelo). */
export async function getFilmDays(
  location: ViewerLocation & { provinceSlug: string },
  title: TitleRow,
  favIds: number[],
): Promise<{ sourceId: number | null; days: FilmDay[] }> {
  const today = romeDateString();
  const [sourceId, nearby] = await Promise.all([
    getSourceFilmId(title, location).catch(() => null),
    getNearbyCinemas(location, 10).catch(() => []),
  ]);
  const days = await Promise.all(
    cinemaDays().map(async (day) => ({
      ...day,
      items: await filmShowtimesForDay(
        location,
        title,
        sourceId,
        nearby,
        day.date,
        today,
        favIds,
      ),
    })),
  );
  return { sourceId, days };
}
