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
import {
  capitalSlug,
  parseCinemaPage,
  parseFilmProvincePage,
  type MmShowing,
} from "./parse";
import {
  getProvinceVenues,
  nearbyKnownVenues,
  nearbyProvinceSlugs,
  venuesFor,
} from "./venues";

// Al massimo due province vicine per richiesta: oltre, una scheda film pagherebbe
// tre pagine MyMovies in più a freddo.
const MAX_NEIGHBOUR_PROVINCES = 2;

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
  prov: string | null,
  n = Infinity,
): Promise<Cinema[]> {
  // Alle sale della propria provincia si uniscono quelle **già note** entro il raggio,
  // di qualunque provincia: 25 km scavalcano il confine quasi ovunque (da Monza il
  // multiplex più vicino è a Milano, da Prato quelli di Firenze). Senza provincia
  // riconosciuta restano solo queste, che è meglio di nessun cinema.
  const [own, known] = await Promise.all([
    prov ? getProvinceVenues(prov) : Promise.resolve([] as Cinema[]),
    nearbyKnownVenues(geo, CINEMA_RADIUS_KM),
  ]);
  const byId = new Map<number, Cinema>();
  for (const c of [...own, ...known]) if (!byId.has(c.id)) byId.set(c.id, c);
  return withDistance(geo, [...byId.values()]).slice(0, n);
}

/** Sale con almeno uno spettacolo nella pagina film-in-provincia. */
function parseFilmEntries(html: string | null) {
  return html ? parseFilmProvincePage(html).filter((e) => e.showings.length > 0) : [];
}

export async function filmShowtimes(
  geo: LatLng,
  prov: string | null,
  filmId: number,
  filmName: string,
  originalTitle: string | null = null,
): Promise<CinemaShowtimes[]> {
  // La pagina film-in-provincia contiene anche le sale del capoluogo (a differenza
  // dell'indice); per alcune province risponde però solo con lo slug del comune
  // capoluogo (`monzabrianza` è sempre vuota, `monza` no). Alle province confinanti
  // dentro il raggio si chiede la stessa pagina: l'id del film è nazionale.
  const neighbours = await nearbyProvinceSlugs(geo, CINEMA_RADIUS_KM, prov ?? "");
  const provinces = prov
    ? [prov, ...neighbours.slice(0, MAX_NEIGHBOUR_PROVINCES)]
    : neighbours.slice(0, MAX_NEIGHBOUR_PROVINCES + 1);
  if (provinces.length === 0) return [];
  const pages = await Promise.all(
    provinces.map(async (p) => {
      const own = parseFilmEntries(await mymovies.filmProvincePage(p, filmId));
      if (own.length > 0 || capitalSlug(p) === p) return own;
      return parseFilmEntries(await mymovies.filmProvincePage(capitalSlug(p), filmId));
    }),
  );
  const byCinema = new Map<number, (typeof pages)[number][number]>();
  for (const list of pages) {
    for (const e of list) if (!byCinema.has(e.cinemaId)) byCinema.set(e.cinemaId, e);
  }
  const entries = [...byCinema.values()];
  if (entries.length === 0) return [];
  // MmCinemaProgramme non ha `id`: il riferimento per `venuesFor` è `cinemaId`.
  const refs = entries.map((e) => ({
    id: e.cinemaId,
    name: e.name,
    town: e.town,
    path: e.path,
  }));
  const venues = withDistance(geo, await venuesFor(prov ?? provinces[0], refs));
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
  // già dentro l'`unstable_cache` qui sopra: niente cache annidata (vedi client.ts)
  const html = await mymovies.cinemaPage(cinema.path, { nested: true });
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
