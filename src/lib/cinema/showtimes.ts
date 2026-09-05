import "server-only";

import { romeDateString, romeIso } from "./dates";
import { normalizeFormat } from "./formats";
import { milesToKm, type LatLng } from "./geo";
import { resolveBookingLinks } from "./links";
import { filmSummaryFor } from "./match";
import { movieglu } from "./movieglu";
import type {
  Cinema,
  CinemaShowtimes,
  MgCinema,
  MgShowings,
  ProgrammeFilm,
  Showing,
} from "./types";

function toCinema(mg: MgCinema): Cinema | null {
  if (mg.lat == null || mg.lng == null) return null;
  return {
    id: mg.cinema_id,
    name: mg.cinema_name,
    address: [mg.address, mg.address2].filter(Boolean).join(", "),
    city: mg.city ?? "",
    lat: mg.lat,
    lng: mg.lng,
    distanceKm: milesToKm(mg.distance ?? 0),
    logoUrl: mg.logo_url ?? null,
  };
}

/** Giorno successivo a `date` (YYYY-MM-DD), a mezzogiorno UTC per evitare l'ora legale. */
function nextDay(date: string): string {
  return romeDateString(new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000));
}

/** Appiattisce `{Standard: {times}, IMAX: {times}}` in spettacoli ordinati. */
function toShowings(showings: MgShowings, date: string, bookingUrl: string): Showing[] {
  const out: Showing[] = [];
  for (const [key, block] of Object.entries(showings)) {
    const format = normalizeFormat(key);
    for (const t of block.times ?? []) {
      const start = romeIso(date, t.start_time);
      const endTime = t.end_time;
      let end = endTime ? romeIso(date, endTime) : null;
      // Spettacolo che finisce dopo mezzanotte: end_time va sul giorno successivo.
      if (end && new Date(end).getTime() <= new Date(start).getTime() && endTime) {
        end = romeIso(nextDay(date), endTime);
      }
      out.push({ start, end, format, bookingUrl });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export async function getNearbyCinemas(geo: LatLng, n = 10): Promise<Cinema[]> {
  const res = await movieglu.cinemasNearby(geo, n);
  return (res?.cinemas ?? []).map(toCinema).filter((c): c is Cinema => c !== null);
}

/**
 * Cinema vicini che danno il film nel giorno indicato, con orari e link.
 * `filmShowTimes` non porta indirizzo/coordinate: si arricchisce dalla lista
 * `cinemasNearby` (stessa cache) e, per i mancanti, da `cinemaDetails`.
 */
export async function getFilmShowtimes(
  geo: LatLng,
  filmId: number,
  filmName: string,
  date: string,
): Promise<CinemaShowtimes[]> {
  const [res, nearby] = await Promise.all([
    movieglu.filmShowTimes(geo, filmId, date, 10),
    getNearbyCinemas(geo, 25),
  ]);
  if (!res) return [];

  const cinemas = await Promise.all(
    res.cinemas.map(async (mg) => {
      const known = nearby.find((c) => c.id === mg.cinema_id);
      if (known) return { cinema: known, mg };
      const details = await movieglu.cinemaDetails(mg.cinema_id);
      const cinema = details ? toCinema({ ...details, distance: mg.distance }) : null;
      return { cinema, mg };
    }),
  );
  const valid = cinemas.filter(
    (x): x is { cinema: Cinema; mg: (typeof res.cinemas)[number] } => x.cinema !== null,
  );

  const links = await resolveBookingLinks(
    valid.map((x) => ({ id: x.cinema.id, name: x.cinema.name })),
    filmName,
  );

  return valid
    .map(({ cinema, mg }) => ({
      cinema,
      showings: toShowings(mg.showings, date, links.get(cinema.id) ?? ""),
    }))
    .filter((x) => x.showings.length > 0)
    .sort((a, b) => a.cinema.distanceKm - b.cinema.distanceKm);
}

/**
 * Tutti i film in programmazione in un cinema nel giorno indicato.
 * Il `Cinema` arriva dal chiamante (da `getNearbyCinemas`): `cinemaShowTimes` è in
 * cache condivisa fra utenti, quindi `res.cinema.distance` non è valido e non va usato.
 */
export async function getCinemaProgramme(
  geo: LatLng,
  cinema: Cinema,
  date: string,
): Promise<ProgrammeFilm[]> {
  const res = await movieglu.cinemaShowTimes(geo, cinema.id, date);
  if (!res) return [];

  const films = await Promise.all(
    res.films.map(async (f) => {
      const [film, links] = await Promise.all([
        filmSummaryFor(f),
        resolveBookingLinks([{ id: cinema.id, name: cinema.name }], f.film_name),
      ]);
      return { film, showings: toShowings(f.showings, date, links.get(cinema.id) ?? "") };
    }),
  );
  return films.filter((f) => f.showings.length > 0);
}
