// Costanti globali dell'app: regione, lingua, provider streaming supportati in Italia.

export const TMDB_REGION = "IT" as const;
export const TMDB_LANGUAGE = "it-IT" as const;

/** TTL della cache locale dei titoli TMDB (7 giorni). */
export const TITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p" as const;

export type PosterSize = "w92" | "w185" | "w342" | "w500" | "original";

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(path: string | null, size: "w780" | "w1280" | "original" = "w1280"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function providerLogoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/w92${path}`;
}

export interface ProviderConfig {
  /** ID provider in TMDB watch/providers */
  tmdbId: number;
  name: string;
  /** Template di ricerca sulla piattaforma, con {query} */
  searchUrl: string;
  /** Template della pagina titolo, con {id} nativo della piattaforma (se esiste) */
  titleUrl?: string;
  /** Proprietà Wikidata che contiene l'ID nativo della piattaforma (se esiste) */
  wikidataProperty?: string;
}

/**
 * Provider streaming supportati in Italia.
 * ID TMDB verificati contro /watch/providers; proprietà Wikidata:
 *  - P1874 Netflix ID, P8055 Amazon Prime Video ID, P7595 Disney+ ID, P9586 Apple TV+ ID.
 */
export const PROVIDERS: Record<number, ProviderConfig> = {
  8: {
    tmdbId: 8,
    name: "Netflix",
    searchUrl: "https://www.netflix.com/search?q={query}",
    titleUrl: "https://www.netflix.com/title/{id}",
    wikidataProperty: "P1874",
  },
  119: {
    tmdbId: 119,
    name: "Prime Video",
    searchUrl: "https://www.primevideo.com/search?phrase={query}",
    // P8055 è un ASIN: può non aprire la pagina IT
    titleUrl: "https://www.primevideo.com/detail/{id}",
    wikidataProperty: "P8055",
  },
  337: {
    tmdbId: 337,
    name: "Disney+",
    searchUrl: "https://www.disneyplus.com/search?q={query}",
    titleUrl: "https://www.disneyplus.com/browse/entity-{id}",
    wikidataProperty: "P7595",
  },
  350: {
    tmdbId: 350,
    name: "Apple TV+",
    searchUrl: "https://tv.apple.com/it/search?term={query}",
    titleUrl: "https://tv.apple.com/it/{id}",
    wikidataProperty: "P9586",
  },
  39: {
    tmdbId: 39,
    name: "NOW",
    searchUrl: "https://www.nowtv.it/search?q={query}",
  },
  531: {
    tmdbId: 531,
    name: "Paramount+",
    // TODO(verify): formato query della ricerca Paramount+ non documentato
    searchUrl: "https://www.paramountplus.com/it/search/",
  },
  222: {
    tmdbId: 222,
    name: "RaiPlay",
    searchUrl: "https://www.raiplay.it/ricerca.html?q={query}",
  },
  524: {
    tmdbId: 524,
    name: "Discovery+",
    // TODO(verify): formato query della ricerca Discovery+ non documentato
    searchUrl: "https://www.discoveryplus.com/it/search?q={query}",
  },
  1899: {
    // ID 1899 confermato dalle risposte watch/providers IT (2026)
    tmdbId: 1899,
    name: "HBO Max",
    // TODO(verify): formato query della ricerca HBO Max non documentato;
    // nessuna proprietà Wikidata confermata per gli ID HBO Max → solo ricerca
    searchUrl: "https://play.hbomax.com/search?q={query}",
  },
  359: {
    // TODO(verify): ID TMDB di Mediaset Infinity non confermato dalla documentazione;
    // 359 risulta da risposte watch/providers IT ma va verificato a runtime
    tmdbId: 359,
    name: "Mediaset Infinity",
    searchUrl: "https://mediasetinfinity.mediaset.it/ricerca?q={query}",
  },
};

/** ID dei provider principali usati per i badge e per discover (Fase 2). */
export const MAIN_PROVIDER_IDS = [8, 119, 337, 350, 39, 531, 222, 524, 1899, 359] as const;
