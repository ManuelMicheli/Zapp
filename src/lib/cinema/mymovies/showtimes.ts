import "server-only";

import { unstable_cache } from "next/cache";
import { CINEMA_RADIUS_KM, MYMOVIES_PAGE_TTL_S } from "@/lib/config";
import { romeDateString, romeIso } from "../dates";
import { distanceKm, type LatLng } from "../geo";
import {
  bookingFallback,
  getBookingContext,
  resolveShowingBookingLinks,
  type ShowingLinks,
} from "../links";
import type { Cinema, CinemaShowtimes, ProgrammeFilm, Showing } from "../types";
import { mymovies } from "./client";
import { filmSummariesForMyMovies } from "./match";
import { parseCinemaPage, parseFilmProvincePage, type MmShowing } from "./parse";
import { getProvinceVenues, venuesFor } from "./venues";

function withDistance(geo: LatLng, venues: Cinema[]): Cinema[] {
  return venues
    .map((c) => ({ ...c, distanceKm: distanceKm(geo, c) }))
    .filter((c) => c.distanceKm <= CINEMA_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** MyMovies pubblica solo il programma di oggi: nessuna fine spettacolo. */
function toShowings(showings: MmShowing[], links: ShowingLinks): Showing[] {
  const today = romeDateString();
  return showings
    .map((s) => {
      const direct = links.byTime.get(s.time);
      return {
        start: romeIso(today, s.time),
        end: null,
        format: s.format,
        bookingUrl: direct?.url ?? links.fallback.url,
        bookingLevel: direct?.level ?? links.fallback.level,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function googleFallback(cinema: Cinema, filmName: string): ShowingLinks {
  return {
    byTime: new Map(),
    fallback: { url: bookingFallback(cinema.name, filmName), level: 0 },
  };
}

/** Tutte le sale della provincia entro `CINEMA_RADIUS_KM`, per distanza (`n` = tetto). */
export async function nearbyCinemas(
  geo: LatLng,
  prov: string,
  n = Infinity,
): Promise<Cinema[]> {
  return withDistance(geo, await getProvinceVenues(prov)).slice(0, n);
}

export async function filmShowtimes(
  geo: LatLng,
  prov: string,
  filmId: number,
  filmName: string,
  originalTitle: string | null = null,
): Promise<CinemaShowtimes[]> {
  const html = await mymovies.filmProvincePage(prov, filmId);
  if (!html) return [];
  const entries = parseFilmProvincePage(html).filter((e) => e.showings.length > 0);
  // MmCinemaProgramme non ha `id`: il riferimento per `venuesFor` è `cinemaId`.
  const refs = entries.map((e) => ({
    id: e.cinemaId,
    name: e.name,
    town: e.town,
    path: e.path,
  }));
  const venues = withDistance(geo, await venuesFor(prov, refs));
  const showingsOf = (cinemaId: number) =>
    entries.find((e) => e.cinemaId === cinemaId)?.showings ?? [];
  const links = await resolveShowingBookingLinks(
    venues.map((cinema) => ({ cinema, times: showingsOf(cinema.id).map((s) => s.time) })),
    { title: filmName, originalTitle },
    romeDateString(),
  );
  return venues.map((cinema) => ({
    cinema,
    showings: toShowings(
      showingsOf(cinema.id),
      links.get(cinema.id) ?? googleFallback(cinema, filmName),
    ),
  }));
}

/**
 * Programma completo di una sala — film, riassunti TMDB, link biglietteria — in cache
 * per la stessa TTL della pagina MyMovies. Il banner in home, `/cinema` e ogni altro
 * utente della stessa zona lo leggono senza rifare né le query né le chiamate alle
 * catene: prima ogni singola richiesta ricostruiva tutto da capo. Chiave: id della
 * sala + data di Roma (il programma è solo quello di oggi).
 */
export function cinemaProgramme(cinema: Cinema): Promise<ProgrammeFilm[]> {
  if (!cinema.path) return Promise.resolve([]);
  return unstable_cache(
    () => buildCinemaProgramme(cinema),
    ["mm-programme", String(cinema.id), romeDateString()],
    { revalidate: MYMOVIES_PAGE_TTL_S },
  )();
}

async function buildCinemaProgramme(cinema: Cinema): Promise<ProgrammeFilm[]> {
  if (!cinema.path) return [];
  const html = await mymovies.cinemaPage(cinema.path);
  if (!html) return [];
  const today = romeDateString();
  const parsed = parseCinemaPage(html).filter((f) => f.showings.length > 0);
  if (parsed.length === 0) return [];

  // Una sola andata e ritorno al DB per tutta la sala: i riassunti dei film e il
  // contesto dei link (manual + sito del cinema). Prima ogni film rifaceva le sue
  // tre query. Gli elenchi delle catene stanno nel memo di `booking/fetch.ts`,
  // quindi risolvere gli orari film per film non ripaga le stesse richieste.
  const [summaries, context] = await Promise.all([
    filmSummariesForMyMovies(parsed),
    getBookingContext([{ id: cinema.id, name: cinema.name }]),
  ]);

  return Promise.all(
    parsed.map(async (f) => {
      const links = await resolveShowingBookingLinks(
        [{ cinema, times: f.showings.map((s) => s.time) }],
        { title: f.title, originalTitle: null },
        today,
        context,
      );
      return {
        film: summaries.get(f.filmId) ?? {
          tmdbId: null,
          sourceFilmId: f.filmId,
          title: f.title,
          posterPath: null,
          backdropPath: null,
        },
        showings: toShowings(
          f.showings,
          links.get(cinema.id) ?? googleFallback(cinema, f.title),
        ),
      };
    }),
  );
}
