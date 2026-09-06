// The Space Cinema: JSON pubblici `showings/cinemas` e `showings/films` (parte pura,
// test Vitest). Solo livello 1: pagina film-in-cinema con gli orari e la scelta della
// data; le sessioni stanno dietro un endpoint autenticato.

import { THESPACE_BASE } from "@/lib/config";
import { bestByName, bestByToken } from "./match";
import type { BookingQuery, ChainLinks } from "./types";

export interface TheSpaceCinema {
  cinemaId: string;
  /** Slug della sede, una parola ("rozzano"). */
  cinemaName: string;
  fullName: string | null;
  whatsOnUrl: string | null;
}

export interface TheSpaceCinemas {
  result: { alpha: string; cinemas: TheSpaceCinema[] }[];
}

export interface TheSpaceFilm {
  filmId: string;
  /** "https://www.thespacecinema.it/film/<slug>" */
  filmUrl: string;
}

export interface TheSpaceFilms {
  result: TheSpaceFilm[];
}

export function pickTheSpaceCinema(
  groups: TheSpaceCinemas["result"],
  name: string,
): TheSpaceCinema | null {
  const all = groups.flatMap((g) => g.cinemas);
  return bestByToken(all, (c) => c.cinemaName, name);
}

/** Slug dell'URL film → titolo leggibile per il confronto ("coyote-vs-acme" → "coyote vs acme"). */
export function theSpaceSlug(film: TheSpaceFilm): string | null {
  const m = /\/film\/([^/?#]+)/.exec(film.filmUrl);
  return m ? m[1] : null;
}

export function pickTheSpaceFilm(
  films: TheSpaceFilm[],
  film: BookingQuery["film"],
): TheSpaceFilm | null {
  const title = (f: TheSpaceFilm) => theSpaceSlug(f)?.replace(/-/g, " ") ?? "";
  return (
    bestByName(films, title, film.title) ??
    (film.originalTitle ? bestByName(films, title, film.originalTitle) : null)
  );
}

export function buildTheSpaceLinks(
  cinema: TheSpaceCinema,
  film: TheSpaceFilm | null,
): ChainLinks {
  const slug = film ? theSpaceSlug(film) : null;
  if (slug) {
    return {
      byTime: new Map(),
      fallback: {
        url: `${THESPACE_BASE}/cinema/${encodeURIComponent(cinema.cinemaName.toLowerCase())}/film/${slug}`,
        level: 1,
      },
    };
  }
  const whatsOn = cinema.whatsOnUrl
    ? new URL(cinema.whatsOnUrl, THESPACE_BASE).href
    : null;
  return {
    byTime: new Map(),
    fallback: whatsOn ? { url: whatsOn, level: 1 } : null,
  };
}
