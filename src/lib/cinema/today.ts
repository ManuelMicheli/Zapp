import "server-only";

import { cache } from "react";
import { romeDateString } from "./dates";
import { orderCinemas } from "./favorites";
import { aggregateByFilm, type FilmEntry, type VenueEntry } from "./programme";
import { getFavoriteCinemaIds, getViewerLocation } from "./queries";
import { getCinemaProgramme, getNearbyCinemas } from "./showtimes";
import type { Cinema } from "./types";

export interface TodayProgramme {
  /** Le 10 sale più vicine, preferiti in testa. */
  cinemas: Cinema[];
  /** Le prime 5 con almeno un film oggi. */
  venues: VenueEntry[];
  /** Per film, dato in più sale prima. */
  films: FilmEntry[];
}

const EMPTY: TodayProgramme = { cinemas: [], venues: [], films: [] };

/**
 * Programmazione di oggi vicino all'utente, condivisa da `/cinema` e dal banner
 * "Al cinema oggi" in home (React `cache()`: una sola lettura per richiesta).
 * Preferiti in testa: il programma si carica per le prime 5 sale, così gli orari dei
 * preferiti arrivano sempre. Senza posizione o provincia → vuoto.
 */
export const getTodayProgramme = cache(async (): Promise<TodayProgramme> => {
  const [location, favIds] = await Promise.all([
    getViewerLocation(),
    getFavoriteCinemaIds(),
  ]);
  if (!location?.provinceSlug) return EMPTY;
  const today = romeDateString();
  const cinemas = orderCinemas(
    await getNearbyCinemas(location, 10).catch(() => []),
    favIds,
  );
  const programmes = await Promise.all(
    cinemas.slice(0, 5).map(async (cinema) => ({
      cinema,
      films: await getCinemaProgramme(location, cinema, today).catch(() => []),
    })),
  );
  const venues = programmes.filter((v) => v.films.length > 0);
  return { cinemas, venues, films: aggregateByFilm(venues) };
});
