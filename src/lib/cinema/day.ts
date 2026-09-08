import "server-only";

import { cache } from "react";
import type { TitleRow } from "@/lib/tmdb/mappers";
import { chainHasProgramme, getChainProgramme, type ChainShowing } from "./booking";
import { pickChainFilm } from "./booking/day";
import { nextDays, romeDateString, romeIso, type DayOption } from "./dates";
import { PROGRAMME_DEADLINE_MS, withDeadline } from "./deadline";
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
  /** Salta MyMovies: sala di catena oltre le prime `PROGRAMME_VENUES`, basta il JSON della catena. */
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

/** Sale considerate per la programmazione: le prime `NEARBY_MAX` in ordine di importanza. */
export const NEARBY_MAX = 12;
/**
 * Fra queste, le prime `PROGRAMME_VENUES` pagano una pagina MyMovies per il programma
 * di oggi (cache 30 min, throttle 4/s: a freddo ~3 s); le altre solo il JSON di catena.
 */
const PROGRAMME_VENUES = 12;

export interface RankedCinemas {
  /** Tutte le sale entro il raggio: preferiti, grandi catene, multisala, indipendenti, poi distanza. */
  all: Cinema[];
  /** Le prime `NEARBY_MAX`. */
  top: Cinema[];
}

/**
 * Le sale vicine in ordine di importanza (`orderCinemas`: preferiti nell'ordine
 * scelto, poi `compareByTier` e distanza), calcolate una volta per richiesta e
 * condivise da pagina, banner e scheda film. Prima erano le 10 più vicine: a Milano
 * centro erano tutte monosala e UCI, The Space e Notorious non comparivano mai.
 */
const rankedCinemas = cache(
  async (
    prov: string,
    lat: number,
    lng: number,
    favKey: string,
  ): Promise<RankedCinemas> => {
    const favIds = favKey.split(",").filter(Boolean).map(Number);
    const geo = { lat, lng, provinceSlug: prov || null };
    const all = orderCinemas(await getNearbyCinemas(geo).catch(() => []), favIds);
    return { all, top: all.slice(0, NEARBY_MAX) };
  },
);

export function getRankedCinemas(
  location: ViewerLocation,
  favIds: number[],
): Promise<RankedCinemas> {
  // chiave su primitive: `location` e `favIds` sono oggetti nuovi a ogni chiamata
  return rankedCinemas(
    location.provinceSlug ?? "",
    location.lat,
    location.lng,
    favIds.join(","),
  );
}

export interface DayProgramme {
  date: string;
  /** Le `NEARBY_MAX` sale considerate, in ordine di importanza. */
  cinemas: Cinema[];
  /** Tutte le sale entro il raggio, stesso ordine (foglio "I tuoi cinema"). */
  allCinemas: Cinema[];
  /** Le sale (fra `cinemas`) con almeno un film quel giorno, stesso ordine. */
  venues: VenueEntry[];
  /** Per film, dato in più sale prima. */
  films: FilmEntry[];
}

const EMPTY = (date: string): DayProgramme => ({
  date,
  cinemas: [],
  allCinemas: [],
  venues: [],
  films: [],
});

/**
 * Programmazione di un giorno vicino all'utente, condivisa da `/cinema` e dal banner
 * in home (React `cache()` per data: una sola lettura per richiesta). Oggi: pagina
 * MyMovies per le prime `PROGRAMME_VENUES` sale e JSON di catena per ogni sala di
 * catena fra le `NEARBY_MAX` (una chiamata in cache per sala); giorni futuri: solo le
 * catene. Senza posizione o provincia → vuoto.
 */
export const getDayProgramme = cache(async (date: string): Promise<DayProgramme> => {
  const [location, favIds] = await Promise.all([
    getViewerLocation(),
    getFavoriteCinemaIds(),
  ]);
  // La provincia aiuta (è l'elenco che si legge dal vivo) ma non serve: senza,
  // restano le sale già note entro il raggio, di qualunque provincia.
  if (!location) return EMPTY(date);
  const today = romeDateString();
  const { all, top } = await withDeadline(
    getRankedCinemas(location, favIds),
    PROGRAMME_DEADLINE_MS,
    { all: [], top: [] },
  );
  // Ogni sala ha il suo tetto di tempo: a regime il programma è in cache e arriva
  // subito, a freddo una sala lenta non trattiene le altre (e nemmeno la pagina).
  // Il lavoro scartato continua e riempie la cache per la richiesta dopo.
  const programmes = await Promise.all(
    top
      .map((cinema, i) => ({ cinema, chainOnly: i >= PROGRAMME_VENUES }))
      .filter(({ cinema, chainOnly }) => !chainOnly || chainHasProgramme(cinema.name))
      .map(async ({ cinema, chainOnly }) => ({
        cinema,
        films: await withDeadline(
          venueFilms(location, cinema, date, today, chainOnly),
          PROGRAMME_DEADLINE_MS,
          [] as ProgrammeFilm[],
        ),
      })),
  );
  const venues = programmes.filter((v) => v.films.length > 0);
  return { date, cinemas: top, allCinemas: all, venues, films: aggregateByFilm(venues) };
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
  location: ViewerLocation,
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
  location: ViewerLocation,
  title: TitleRow,
  favIds: number[],
): Promise<{ sourceId: number | null; days: FilmDay[] }> {
  const today = romeDateString();
  const [sourceId, { top: nearby }] = await Promise.all([
    getSourceFilmId(title, location).catch(() => null),
    getRankedCinemas(location, favIds),
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
