import "server-only";

import { CINEMA_RADIUS_KM } from "@/lib/config";
import { romeDateString, romeIso } from "../dates";
import { distanceKm, type LatLng } from "../geo";
import { bookingFallback, resolveShowingBookingLinks, type ShowingLinks } from "../links";
import type { Cinema, CinemaShowtimes, ProgrammeFilm, Showing } from "../types";
import { mymovies } from "./client";
import { filmSummaryForMyMovies } from "./match";
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

export async function nearbyCinemas(
  geo: LatLng,
  prov: string,
  n: number,
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

export async function cinemaProgramme(cinema: Cinema): Promise<ProgrammeFilm[]> {
  if (!cinema.path) return [];
  const html = await mymovies.cinemaPage(cinema.path);
  if (!html) return [];
  const today = romeDateString();
  // Un film per volta: il resolver di catena è in cache, quindi le chiamate esterne
  // sono poche (elenchi condivisi + una programmazione per cinema).
  const films = await Promise.all(
    parseCinemaPage(html).map(async (f) => {
      const [film, links] = await Promise.all([
        filmSummaryForMyMovies(f),
        resolveShowingBookingLinks(
          [{ cinema, times: f.showings.map((s) => s.time) }],
          { title: f.title, originalTitle: null },
          today,
        ),
      ]);
      return {
        film,
        showings: toShowings(
          f.showings,
          links.get(cinema.id) ?? googleFallback(cinema, f.title),
        ),
      };
    }),
  );
  return films.filter((f) => f.showings.length > 0);
}
