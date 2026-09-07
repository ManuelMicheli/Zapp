import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialChannel, type OfficialChannel } from "./channels";
import { videoMatchesTitle, type TitleIdentity } from "./match";

/** Ordine di preferenza dei tipi di video TMDB usabili come fondale. */
const TYPE_ORDER = ["Trailer", "Teaser"] as const;

function isYouTube(video: TmdbVideo): boolean {
  return video.site === "YouTube" && Boolean(video.key);
}

/** Ufficiali prima dei caricamenti di terzi; a parità, lingua italiana esplicita prima. */
function byOfficial(a: TmdbVideo, b: TmdbVideo): number {
  return (
    Number(b.official) - Number(a.official) ||
    Number(b.iso_639_1 === "it") - Number(a.iso_639_1 === "it")
  );
}

/** Ordine di preferenza per lingua: italiano, poi inglese, poi lingua non dichiarata. */
function langRank(video: TmdbVideo): number {
  if (video.iso_639_1 === "it") return 0;
  if (video.iso_639_1 === "en") return 1;
  return 2;
}

/**
 * Candidati TMDB da verificare con oEmbed: solo YouTube, in ordine Trailer → Teaser e,
 * dentro ogni tipo, italiani → inglesi → senza lingua, ufficiali prima. Le lingue
 * diverse dall'italiano servono al ripiego etichettato "Trailer in inglese": è chi
 * chiama (`compute.ts`) a usarle solo dopo aver esaurito l'italiano.
 */
export function rankTmdbCandidates(videos: TmdbVideos | undefined): TmdbVideo[] {
  const list = (videos?.results ?? []).filter(isYouTube);
  const ranked: TmdbVideo[] = [];
  for (const type of TYPE_ORDER) {
    ranked.push(
      ...list
        .filter((v) => v.type === type)
        .sort((a, b) => langRank(a) - langRank(b) || byOfficial(a, b)),
    );
  }
  return ranked;
}

/** Lingua audio dichiarata su YouTube (`snippet.defaultAudioLanguage`, es. "it", "it-IT"). */
export function isItalianAudio(language: string | undefined | null): boolean {
  return /^it(-|$)/i.test(language ?? "");
}

/**
 * Un video è italiano se TMDB lo dice o se YouTube dichiara l'audio italiano; se nessuno
 * indica la lingua basta che il canale sia di un distributore italiano (pubblica solo
 * materiale italiano). Dai canali globali (Netflix, MUBI, Apple TV) senza lingua
 * esplicita non ci si fida.
 */
export function isItalianForChannel(
  video: TmdbVideo,
  channel: OfficialChannel,
  audioLanguage?: string | null,
): boolean {
  if (video.iso_639_1 === "it") return true;
  if (isItalianAudio(audioLanguage)) return true;
  return video.iso_639_1 == null && channel.italian;
}

export interface SearchResult {
  id: string;
  title: string;
  channelId: string;
  /** ISO 8601 (`snippet.publishedAt`). */
  publishedAt: string;
  /** `snippet.defaultAudioLanguage` da `videos.list`, se letto (canali globali). */
  audioLanguage?: string | null;
}

export interface RankSearchOptions {
  /** Film: data d'uscita TMDB (`YYYY-MM-DD`); scarta video di oltre due anni prima. */
  releaseDate?: string | null;
  /** Di chi deve essere il video: la verifica dura di `match.ts`. */
  identity: TitleIdentity;
}

/** "live" da solo è una diretta; "live action" è un genere e resta un trailer. */
const NOT_A_TRAILER =
  /\b(clip|featurette|spot|intervist\w*|backstage|making of|dietro le quinte|scena|recensione|reaction|podcast|live(?![ -]?action)|behind the scenes|promo|bts)\b/i;
const ITALIAN_HINT =
  /\b(ita|italiano|italiana|italian|sub ita|sottotitol\w*|doppiat\w*)\b/i;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function trailerScore(title: string): number {
  if (/trailer\s+ufficiale/i.test(title)) return 3;
  if (/\btrailer\b/i.test(title)) return 2;
  if (/\bteaser\b/i.test(title)) return 1;
  return 0;
}

/**
 * Un risultato di ricerca è italiano se il canale è di un distributore italiano, se
 * YouTube dichiara l'audio italiano o se il titolo lo dice ("ita", "italiano", "sub ita").
 */
function isItalianResult(item: SearchResult, channel: OfficialChannel): boolean {
  return (
    channel.italian || isItalianAudio(item.audioLanguage) || ITALIAN_HINT.test(item.title)
  );
}

/**
 * Risultati della ricerca YouTube (Data API) filtrati e ordinati: solo canali ufficiali,
 * **solo video che sono di quel titolo** (`videoMatchesTitle`), solo trailer/teaser
 * (niente clip, featurette, spot, interviste), dai canali globali solo video con audio
 * italiano o titoli che dichiarano l'italiano. Punteggio "Trailer
 * ufficiale" > trailer > teaser; a parità resta l'ordine di rilevanza di YouTube.
 */
export function rankSearchResults(
  items: SearchResult[],
  options: RankSearchOptions,
): SearchResult[] {
  const release = options.releaseDate ? Date.parse(options.releaseDate) : NaN;
  return items
    .map((item, index) => {
      const channel = getOfficialChannel(item.channelId);
      if (!channel) return null;
      if (NOT_A_TRAILER.test(item.title)) return null;
      const score = trailerScore(item.title);
      if (score === 0) return null;
      if (!isItalianResult(item, channel)) return null;
      // la verifica dura: il video deve essere di quel titolo, non di un seguito, di
      // uno spin-off o di un'altra opera dello stesso canale
      if (!videoMatchesTitle(item.title, options.identity, channel.name)) return null;
      if (!Number.isNaN(release)) {
        const published = Date.parse(item.publishedAt);
        if (!Number.isNaN(published) && published < release - TWO_YEARS_MS) return null;
      }
      return { item, score, index };
    })
    .filter((r): r is { item: SearchResult; score: number; index: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
