export type PlaybackState = "playing" | "paused" | "stopped" | "buffering";

/** I siti che l'estensione del browser osserva. Un sito = una piattaforma TMDB. */
export type Site = "netflix" | "prime" | "disney" | "now";

export interface ScrobbleEvent {
  id: string;
  at: string; // ISO
  package: string;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  meta: Record<string, string | null | undefined>;
  extras?: Record<string, string>;
  notification?: { title?: string | null; text?: string | null };
}

/**
 * Cosa l'estensione del browser ha visto, senza interpretazioni.
 *
 * Due famiglie di campi, perche' una sonda sulla Netflix vera (2026-09-09) ha
 * dimostrato che Netflix non popola `navigator.mediaSession`: `title`,
 * `artist`, `album` sono nulli su ogni riga, `playbackState` resta sempre
 * `"none"`. Restano qui per Prime/Disney+/NOW, dove potrebbe davvero esserci
 * (nessuna sonda li ha ancora verificati) — se c'e' e' la fonte migliore.
 * I tre campi DOM sono la sorgente vera su Netflix, presa da
 * `[data-uia="video-title"]` dentro `/watch/<id>`.
 */
export interface RawEvent {
  /** Identita DOM opaca: restituita solo per la card della scrittura confermata. */
  contentKey?: string;
  playbackRate?: number;
  id: string;
  at: string; // ISO
  site: Site;
  state: PlaybackState;
  url: string | null;

  // --- navigator.mediaSession: forma standard, title = episodio/film, artist = opera ---
  title: string | null;
  artist: string | null;
  album: string | null;

  // --- DOM Netflix (sonda 2026-09-09, `src/lib/scrobble/__fixtures__/netflix.json`) ---
  /**
   * `[data-uia="video-title"]` per intero. Incolla senza separatori il nome
   * pulito e il codice+nome dell'episodio ("Hajime no Ippo: The
   * Fighting!E23Episodio 23"): mai da parsare direttamente, solo da usare come
   * residuo dopo aver tolto `showText`. Nei film è l'unico dei tre presente.
   */
  titleText: string | null;
  /**
   * `[data-uia="video-title"] h4`: il nome pulito dell'opera. Esiste **solo**
   * nelle serie — la sua presenza/assenza è il modo per distinguere una serie
   * da un film, non la forma del dettaglio.
   */
  showText: string | null;
  /**
   * `pause-ad-title-display`, testo grezzo (puo' avere piu' righe: la seconda
   * è il tempo restante, non fa parte del titolo). Quando c'e' porta stagione,
   * episodio e nome espliciti insieme ("S1:E23 \"Episodio 23\"") ed è la fonte
   * migliore — indipendente dallo stato di pausa dichiarato nell'evento.
   */
  pauseText: string | null;

  positionMs: number | null;
  durationMs: number | null;
}

export interface ParsedMedia {
  kind: "movie" | "tv" | "unknown";
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  /** hash stabile di (provider, titolo, stagione, episodio): chiave delle pending */
  key: string;
}

export interface Candidate {
  title_id: number;
  media_type: "movie" | "tv";
  title: string;
  year: number | null;
  poster_path: string | null;
  score: number;
}

export type MatchResult =
  | { kind: "auto"; candidate: Candidate; season: number | null; episode: number | null }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "none" };

/** Elemento del batch passato alla RPC scrobble_apply (spec §6). */
export interface ApplyItem {
  at: string;
  provider_id: number;
  state: PlaybackState;
  position_ms: number;
  duration_ms: number | null;
  match: {
    title_id: number;
    media_type: "movie" | "tv";
    season: number | null;
    episode: number | null;
  } | null;
  pending: {
    reason: "ambiguous_title" | "unknown_title";
    raw: ParsedMedia & { provider_id: number };
    candidates: Candidate[];
  } | null;
}
