// Costanti globali dell'app: regione, lingua, provider streaming supportati in Italia.

export const TMDB_REGION = "IT" as const;
export const TMDB_LANGUAGE = "it-IT" as const;

/** TTL della cache locale dei titoli TMDB (7 giorni). */
export const TITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Righe di `titles` scaricate prima di questa data hanno un `raw` incompleto
 * (video solo in italiano prima di `include_video_language`; **keyword mancanti**
 * prima del motore dei consigli, 2026-09-07) o gonfio (offerte duplicate, cast
 * intero e immagini prima della dieta di `slim-raw.ts`, 2026-09-08): sulla
 * scheda titolo vengono riscaricate una volta anche se il TTL non è scaduto.
 */
export const TITLE_CACHE_EPOCH = new Date("2026-09-08T12:00:00Z").getTime();

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p" as const;

export type PosterSize = "w92" | "w185" | "w342" | "w500" | "original";

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function backdropUrl(
  path: string | null,
  size: "w780" | "w1280" | "original" = "w1280",
): string | null {
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
  /** Home della piattaforma (accesso rapido dalla home di Zapp) */
  homeUrl: string;
  /** Template di ricerca sulla piattaforma, con {query} */
  searchUrl: string;
  /** Template della pagina titolo, con {id} nativo della piattaforma (se esiste) */
  titleUrl?: string;
  /** Proprietà Wikidata che contiene l'ID nativo della piattaforma (se esiste) */
  wikidataProperty?: string;
}

/**
 * Provider streaming supportati in Italia (per home, ricerca e fallback dei link).
 * I link diretti alle pagine titolo arrivano da JustWatch per qualunque provider
 * (`src/lib/links/justwatch.ts`); `titleUrl`/`wikidataProperty` sono il secondo
 * livello della cascata, `searchUrl` l'ultimo.
 * ID TMDB verificati contro /watch/providers; proprietà Wikidata:
 *  - P1874 Netflix ID, P8055 Amazon Prime Video ID, P7595 Disney+ ID, P9586 Apple TV+ ID.
 */
export const PROVIDERS: Record<number, ProviderConfig> = {
  8: {
    tmdbId: 8,
    name: "Netflix",
    homeUrl: "https://www.netflix.com/browse",
    searchUrl: "https://www.netflix.com/search?q={query}",
    titleUrl: "https://www.netflix.com/title/{id}",
    wikidataProperty: "P1874",
  },
  119: {
    tmdbId: 119,
    name: "Prime Video",
    homeUrl: "https://www.primevideo.com/",
    searchUrl: "https://www.primevideo.com/search?phrase={query}",
    // P8055 è un ASIN: può non aprire la pagina IT
    titleUrl: "https://www.primevideo.com/detail/{id}",
    wikidataProperty: "P8055",
  },
  337: {
    tmdbId: 337,
    name: "Disney+",
    homeUrl: "https://www.disneyplus.com/home",
    searchUrl: "https://www.disneyplus.com/search?q={query}",
    titleUrl: "https://www.disneyplus.com/browse/entity-{id}",
    wikidataProperty: "P7595",
  },
  350: {
    tmdbId: 350,
    name: "Apple TV+",
    homeUrl: "https://tv.apple.com/it",
    searchUrl: "https://tv.apple.com/it/search?term={query}",
    titleUrl: "https://tv.apple.com/it/{id}",
    wikidataProperty: "P9586",
  },
  39: {
    tmdbId: 39,
    name: "NOW",
    homeUrl: "https://www.nowtv.it/",
    searchUrl: "https://www.nowtv.it/search?q={query}",
  },
  531: {
    tmdbId: 531,
    name: "Paramount+",
    homeUrl: "https://www.paramountplus.com/it/",
    // TODO(verify): formato query della ricerca Paramount+ non documentato
    searchUrl: "https://www.paramountplus.com/it/search/",
  },
  222: {
    tmdbId: 222,
    name: "RaiPlay",
    homeUrl: "https://www.raiplay.it/",
    searchUrl: "https://www.raiplay.it/ricerca.html?q={query}",
  },
  524: {
    tmdbId: 524,
    name: "Discovery+",
    homeUrl: "https://www.discoveryplus.com/it/",
    // TODO(verify): formato query della ricerca Discovery+ non documentato
    searchUrl: "https://www.discoveryplus.com/it/search?q={query}",
  },
  1899: {
    // ID 1899 confermato dalle risposte watch/providers IT (2026)
    tmdbId: 1899,
    name: "HBO Max",
    homeUrl: "https://play.hbomax.com/",
    // TODO(verify): formato query della ricerca HBO Max non documentato;
    // nessuna proprietà Wikidata confermata per gli ID HBO Max → solo ricerca
    searchUrl: "https://play.hbomax.com/search?q={query}",
  },
  359: {
    // TODO(verify): ID TMDB di Mediaset Infinity non confermato dalla documentazione;
    // 359 risulta da risposte watch/providers IT ma va verificato a runtime
    tmdbId: 359,
    name: "Mediaset Infinity",
    homeUrl: "https://mediasetinfinity.mediaset.it/",
    searchUrl: "https://mediasetinfinity.mediaset.it/ricerca?q={query}",
  },
};

/**
 * Colori di marca dei servizi: insieme a Netflix in `GENRE_COLORS` sono l'unico
 * posto in cui l'app usa hex grezzi invece dei token (vedi CLAUDE.md). Servono alla
 * card di "Dove guardarlo", che porta una sfumatura leggerissima del marchio. Qui
 * stanno solo i marchi che conosciamo: per tutti gli altri (i canali Amazon sono
 * decine) il colore lo dà il logo, vedi `src/lib/colors/provider-brand.ts`.
 */
export const PROVIDER_BRAND: Record<number, string> = {
  8: "#E50914", // Netflix
  119: "#00A8E1", // Prime Video
  2100: "#00A8E1", // Prime Video with Ads
  10: "#00A8E1", // Amazon Video (noleggio)
  337: "#113CCF", // Disney+
  350: "#9CA3AF", // Apple TV+
  2: "#9CA3AF", // Apple TV (noleggio)
  35: "#BF0000", // Rakuten TV
  3: "#01875F", // Google Play
  40: "#E8322A", // CHILI
  109: "#003C7E", // Timvision
  39: "#00B2A9", // NOW
  531: "#0064FF", // Paramount+
  1899: "#991EEB", // HBO Max
  222: "#1E5AA8", // RaiPlay
  524: "#0072E5", // Discovery+
  359: "#E4002B", // Mediaset Infinity
};

function hexToRgb(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}

/**
 * Sfumatura del marchio per la card di un servizio: fondo diagonale che sfuma sul
 * `surface` e bordo della stessa tinta. L'azione ("Apri"/"Cerca") resta neutra a
 * tutti i servizi: colorare anche quella faceva sembrare la riga un banner.
 * Il colore arriva da `getProviderBrand` (mappa qui sopra, poi il logo del servizio):
 * ogni riga di "Dove guardarlo" ha la sua sfumatura, nessuna resta neutra.
 */
export function providerTint(hex: string): { background: string; borderColor: string } {
  const rgb = hexToRgb(hex);
  return {
    background: `linear-gradient(100deg, rgba(${rgb}, 0.14), rgba(${rgb}, 0.03) 48%, var(--color-surface) 78%)`,
    borderColor: `rgba(${rgb}, 0.20)`,
  };
}

/** ID dei provider principali usati per i badge e per discover (Fase 2). */
export const MAIN_PROVIDER_IDS = [
  8, 119, 337, 350, 39, 531, 222, 524, 1899, 359,
] as const;

/** Orari cinema (MovieGlu): cache per cella geografica di ~110 m. */
export const SHOWTIME_CACHE_TTL_MS = 15 * 60 * 1000;
/** Match TMDB ↔ MovieGlu in `cinema_films`: rifatto una volta al giorno. */
export const CINEMA_FILM_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
/** Sito del cinema da MovieGlu in `cinema_links`: 30 giorni. */
export const CINEMA_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Geocoding (solo server): Nominatim richiede uno User-Agent identificabile. */
export const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

/** Cinema entro questo raggio dalla posizione dell'utente. */
export const CINEMA_RADIUS_KM = 25;
/** MyMovies: pagine pubbliche lette lato server (vedi src/lib/cinema/mymovies). */
export const MYMOVIES_BASE = "https://www.mymovies.it";
export const MYMOVIES_INDEX_TTL_S = 6 * 60 * 60;
export const MYMOVIES_PAGE_TTL_S = 30 * 60;
export const MYMOVIES_MAPPA_TTL_S = 30 * 24 * 60 * 60;
// L'elenco delle province italiane non cambia: si rilegge una volta al mese.
export const MYMOVIES_PROVINCES_TTL_S = 30 * 24 * 60 * 60;

/**
 * Biglietteria delle catene (solo server, vedi src/lib/cinema/booking): JSON pubblici
 * non documentati, letti con cache. Base API UCI letta da `__NUXT__.config.public.apiUrl`
 * di ucicinemas.it (2026-09-06): se cambia si aggiorna qui.
 */
export const UCI_API_BASE =
  "https://myuci---uci-backend-production-nfluwp7wga-oc.a.run.app/api";
export const UCI_SITE_BASE = "https://ucicinemas.it"; // senza www: con www c'è Queue-it
export const THESPACE_BASE = "https://www.thespacecinema.it";
export const NOTORIOUS_BASE = "https://www.notoriouscinemas.it";
export const CINELANDIA_BASE = "https://www.cinelandia.it";
/** Webtic: programmazione pubblica (POST) e frame di acquisto (vedi booking/webtic.ts). */
export const WEBTIC_API_BASE = "https://restapi.webtic.it";
export const WEBTIC_SECURE_BASE = "https://secure.webtic.it";
/** Elenchi cinema 24 h, elenchi film 6 h, programmazione 30 min. */
export const BOOKING_VENUES_TTL_S = 24 * 60 * 60;
export const BOOKING_FILMS_TTL_S = 6 * 60 * 60;
export const BOOKING_SCHEDULE_TTL_S = 30 * 60;
/** Un cinema della catena "è" quello MyMovies se dista meno di così. */
export const BOOKING_VENUE_MAX_KM = 0.5;

/** Notifiche push (Expo): la sua API accetta al massimo 100 messaggi per richiesta. */
export const PUSH_BATCH = 100;
/**
 * Quanto si aspetta prima di chiedere la ricevuta di un biglietto: Expo consegna
 * ad Apple e Google in modo asincrono, e prima di qualche minuto la ricevuta non
 * c'è ancora. Quindici minuti stanno larghi dentro il cron ogni mezz'ora.
 */
export const PUSH_RECEIPT_DELAY_MIN = 15;
/** Quante notifiche spingere per giro: i 60 s della funzione bastano per queste. */
export const PUSH_NOTIFICATIONS_PER_RUN = 200;
