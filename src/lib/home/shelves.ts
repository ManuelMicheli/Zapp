import "server-only";
import { cache } from "react";
import { PROVIDERS, providerLogoUrl } from "@/lib/config";
import { discoverNewOnStreaming, getMovieList, getProviderList } from "@/lib/tmdb/client";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { getSimilarTitles } from "@/lib/similar/similar";
import { readSeeds } from "@/lib/similar/store";
import { applyTaste, tasteProfile, type TasteProfile } from "@/lib/similar/taste";
import type { SimilarItem } from "@/lib/similar/types";
import { getTaste } from "./hero";
import {
  cleanShelf,
  SHELF_SIZE,
  type BecauseSource,
  type ShelfItem,
} from "./shelves-rank";

export type { ShelfItem } from "./shelves-rank";

type MediaType = "movie" | "tv";

/**
 * Le piattaforme che fanno da pillole allo scaffale "Da vedere": le cinque che in
 * Italia pubblicano abbastanza novità da riempire uno scaffale. Le altre di
 * `MAIN_PROVIDER_IDS` restano nella barra "Le tue piattaforme" della home vuota.
 */
export const SHELF_PROVIDER_IDS = [8, 119, 337, 350, 39] as const;

function toShelfItems(
  results: TmdbMultiResult[] | null | undefined,
  type: MediaType,
): ShelfItem[] {
  return (results ?? [])
    .filter((r) => r.media_type === type)
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType: type,
      title: searchResultTitle(r),
      posterPath: r.poster_path as string,
      year: searchResultYear(r),
    }));
}

/** Film e serie a turno per la scheda "Tutto", come fa il carosello. */
export function mixShelf(movie: ShelfItem[], tv: ShelfItem[]): ShelfItem[] {
  const out: ShelfItem[] = [];
  for (let i = 0; i < movie.length || i < tv.length; i++) {
    if (movie[i]) out.push(movie[i]);
    if (tv[i]) out.push(tv[i]);
  }
  return out;
}

/** Le tre varianti di uno scaffale: la scheda in testata ne mostra una sola. */
export interface ByTab<T> {
  movie: T;
  tv: T;
  all: T;
}

// ============ Perché hai visto X ============

/**
 * I titoli dello stesso filone di un titolo finito, ri-ordinati sul gusto di chi
 * guarda e senza ciò che ha già in libreria.
 *
 * Il grosso del lavoro è la classifica impersonale di `getSimilarTitles`, condivisa
 * fra tutti gli utenti e salvata in `title_similar`: qui sopra ci va solo il pezzo
 * personale, che è un riordino in memoria e non costa niente.
 */
export const getBecauseShelf = cache(
  async (
    mediaType: MediaType,
    titleId: number,
    taste: TasteProfile,
    rating: number | null = null,
  ): Promise<SimilarItem[]> => {
    const { owned } = await getTaste();
    const items = await getSimilarTitles(titleId, mediaType).catch(() => []);
    return applyTaste(items, taste, owned, rating).slice(0, SHELF_SIZE);
  },
);

/**
 * Il gusto di chi guarda, dedotto dagli identikit già salvati dei titoli che ha
 * finito: registi e temi che ricorrono in almeno due di essi.
 */
export const getBecauseTaste = cache(
  async (sources: readonly BecauseSource[]): Promise<TasteProfile> => {
    const seeds = await readSeeds(
      sources.map((s) => ({ id: s.titleId, mediaType: s.mediaType })),
    ).catch(() => []);
    return tasteProfile(seeds);
  },
);

// ============ Novità sulle piattaforme (pillole di "Da vedere") ============

export interface PlatformShelf {
  id: number;
  name: string;
  logo: string | null;
  movie: ShelfItem[];
  tv: ShelfItem[];
}

/**
 * Le novità di ogni piattaforma, già divise per tipo: le pillole dello scaffale
 * "Da vedere" cambiano lista senza tornare al server. Una piattaforma che non
 * risponde (o senza novità) sparisce dalle pillole, non svuota lo scaffale.
 */
export const getPlatformShelves = cache(async (): Promise<PlatformShelf[]> => {
  const logos = await getProviderList()
    .then((list) => new Map(list.map((p) => [p.provider_id, p.logo_path])))
    .catch(() => new Map<number, string | null>());

  const shelves = await Promise.all(
    SHELF_PROVIDER_IDS.map(async (id) => {
      const [movie, tv] = await Promise.all([
        discoverNewOnStreaming("movie", [id]).catch(() => null),
        discoverNewOnStreaming("tv", [id]).catch(() => null),
      ]);
      return {
        id,
        name: PROVIDERS[id]?.name ?? String(id),
        logo: providerLogoUrl(logos.get(id) ?? null),
        movie: cleanShelf(toShelfItems(movie?.results, "movie")),
        tv: cleanShelf(toShelfItems(tv?.results, "tv")),
      };
    }),
  );
  return shelves.filter((s) => s.movie.length > 0 || s.tv.length > 0);
});

// ============ I più amati di sempre ============

/** Resta la lista TMDB per voto: la fase B la sostituirà con lo ZappScore. */
// ============ In arrivo ============

export interface ComingSoonItem extends ShelfItem {
  backdropPath: string | null;
  releaseDate: string | null;
}

/**
 * Solo film non ancora usciti, dal più vicino: è l'unico scaffale della home che
 * parla di domani. Le serie non hanno un equivalente TMDB per la regione IT.
 */
export const getComingSoon = cache(async (): Promise<ComingSoonItem[]> => {
  const page = await getMovieList("upcoming").catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (r: TmdbMultiResult) =>
    r.media_type === "movie" ? (r.release_date ?? "") : "";
  const future = (page?.results ?? [])
    .filter((r) => dateOf(r) > today)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const items = cleanShelf(toShelfItems(future, "movie"), new Set(), 12);
  const byId = new Map(future.map((r) => [r.id, r]));
  return items.map((item) => ({
    ...item,
    backdropPath: byId.get(item.id)?.backdrop_path ?? null,
    releaseDate: dateOf(byId.get(item.id)!) || null,
  }));
});
