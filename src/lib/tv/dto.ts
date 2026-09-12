/**
 * Contratto dell'API `/api/tv/v1`. **E' l'unica fonte**: i modelli Kotlin
 * (`ZappTV/android`) e Swift (`ZappTV/tvos`) sono copie a mano di questo file, con in
 * testa il commit da cui derivano. Cambi qui = cambi nelle due copie nello stesso giro.
 * Le immagini sono percorsi TMDB: la TV compone `https://image.tmdb.org/t/p/<size><path>`.
 */
export type MediaType = "movie" | "tv";
export type WatchStatus = "watching" | "want" | "watched" | "dropped";

export interface TitleCard {
  id: number;
  mediaType: MediaType;
  name: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** ZappScore 0-10 e voti dietro; `null` se il titolo non ne ha ancora. */
  zappScore: number | null;
  zappVotes: number;
  /** Affinita' personale 0-100 e motivo in italiano: solo dagli scaffali del motore. */
  affinity: number | null;
  reason: string | null;
  /** Piattaforme IT note (flatrate) per la pillola sulla tessera; vuoto se non in cache. */
  providerIds: number[];
}

export interface ContinueCard extends TitleCard {
  entryId: string;
  /** "S1:E5" e nome dell'episodio da riprendere; null per un film. */
  episodeLabel: string | null;
  episodeName: string | null;
  shownSeason: number | null;
  shownEpisode: number | null;
  /** Grafica orizzontale ufficiale del titolo, taglia `original` gia' completa di URL. */
  imageUrl: string | null;
  runtimeLabel: string | null;
  progressPct: number | null;
  resumePositionMs: number | null;
  resumeDurationMs: number | null;
  providerId: number | null;
  /** Un dispositivo collegato lo sta riproducendo adesso. */
  live: boolean;
}

export interface HeroCard extends TitleCard {
  overview: string | null;
}

export type ShelfLayout = "poster" | "backdrop" | "numbered";

export interface ShelfRef {
  /** `foryou` | `persone:<k>` | `because:<type>:<id>` | `generi:<k>` | `decenni:<k>` | `topten` | `want` | `platform:<id>` | `toprated` | `comingsoon` */
  key: string;
  title: string;
  subtitle: string | null;
  layout: ShelfLayout;
}

export interface Shelf extends ShelfRef {
  items: TitleCard[];
}

export interface LibraryCard extends TitleCard {
  status: WatchStatus;
  /** Il voto dell'utente, non lo ZappScore. */
  rating: number | null;
}

export interface LibraryPage {
  items: LibraryCard[];
  total: number;
}

export interface ProviderInfo {
  id: number;
  name: string;
  logoPath: string | null;
}

export interface ProviderOffer extends ProviderInfo {
  kind: "flatrate" | "rent" | "buy" | "free" | "ads";
  /** `POST /play` puo' lanciare l'app su Android TV; `expected` dice cosa succedera'. */
  canLaunch: boolean;
  expected: "avvia" | "scheda" | "app" | null;
  /** Link https alla pagina del titolo sulla piattaforma, se gia' risolto. */
  url: string | null;
}

export interface UserEntry {
  status: WatchStatus;
  rating: number | null;
  season: number | null;
  episode: number | null;
  next: { season: number; episode: number } | null;
}

export interface SeasonSummary {
  number: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
  /** Episodi gia' visti in questa stagione. */
  watched: number;
}

export interface CastMember {
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface TitleDetail extends TitleCard {
  originalName: string | null;
  overview: string | null;
  tagline: string | null;
  genres: string[];
  runtimeMin: number | null;
  releaseDate: string | null;
  tmdbRating: number | null;
  cast: CastMember[];
  trailer: { youtubeId: string } | null;
  providers: ProviderOffer[];
  entry: UserEntry | null;
  seasons: SeasonSummary[];
  similar: TitleCard[];
  /** Tinta della locandina in esadecimale, per il fondale (spec §6). */
  palette: { primary: string; secondary: string } | null;
}

export interface EpisodeItem {
  number: number;
  name: string;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMin: number | null;
  watched: boolean;
  /** Minuto a cui riprendere, se ZConnection lo sa. */
  resumeMs: number | null;
}

export interface SeasonDetail {
  number: number;
  name: string;
  overview: string | null;
  episodes: EpisodeItem[];
}

export interface LaunchPlan {
  commandId: string;
  android: {
    packages: string[];
    dataUri: string | null;
    extraDeeplink: string | null;
  } | null;
  /** Fase C: si riempie con la sonda su Apple TV. */
  tvos: { url: string } | null;
  expected: "avvia" | "scheda" | "app";
}

export type WatchAction =
  "want" | "watching" | "watched" | "drop" | "remove" | "episode" | "rate";
