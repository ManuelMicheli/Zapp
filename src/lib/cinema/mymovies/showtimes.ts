import "server-only";

import { CINEMA_RADIUS_KM } from "@/lib/config";
import { romeDateString, romeIso } from "../dates";
import { distanceKm, type LatLng } from "../geo";
import { bookingFallback, resolveBookingLinks, resolveCinemaSites } from "../links";
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
function toShowings(showings: MmShowing[], bookingUrl: string): Showing[] {
  const today = romeDateString();
  return showings
    .map((s) => ({
      start: romeIso(today, s.time),
      end: null,
      format: s.format,
      bookingUrl,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
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
  const links = await resolveBookingLinks(
    venues.map((c) => ({ id: c.id, name: c.name })),
    filmName,
  );
  return venues.map((cinema) => ({
    cinema,
    showings: toShowings(
      entries.find((e) => e.cinemaId === cinema.id)?.showings ?? [],
      links.get(cinema.id) ?? bookingFallback(cinema.name, filmName),
    ),
  }));
}

export async function cinemaProgramme(cinema: Cinema): Promise<ProgrammeFilm[]> {
  if (!cinema.path) return [];
  const html = await mymovies.cinemaPage(cinema.path);
  if (!html) return [];
  const sites = await resolveCinemaSites([{ id: cinema.id, name: cinema.name }]);
  const site = sites.get(cinema.id) ?? null;
  const films = await Promise.all(
    parseCinemaPage(html).map(async (f) => ({
      film: await filmSummaryForMyMovies(f),
      showings: toShowings(f.showings, site ?? bookingFallback(cinema.name, f.title)),
    })),
  );
  return films.filter((f) => f.showings.length > 0);
}
