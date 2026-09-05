import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialChannel, type OfficialChannel } from "./channels";

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

/**
 * Candidati TMDB da verificare con oEmbed: solo YouTube, solo italiani o senza lingua
 * (la lingua "null" si decide poi dal canale, vedi `isItalianForChannel`); mai inglese.
 * Ordine: Trailer → Teaser, ufficiali prima.
 */
export function rankTmdbCandidates(videos: TmdbVideos | undefined): TmdbVideo[] {
  const list = (videos?.results ?? []).filter(
    (v) => isYouTube(v) && (v.iso_639_1 === "it" || v.iso_639_1 == null),
  );
  const ranked: TmdbVideo[] = [];
  for (const type of TYPE_ORDER) {
    ranked.push(...list.filter((v) => v.type === type).sort(byOfficial));
  }
  return ranked;
}

/**
 * Un video è italiano se TMDB lo dice; se TMDB non indica la lingua basta che il
 * canale sia di un distributore italiano (pubblica solo materiale italiano). Dai canali
 * globali (Netflix, MUBI, Apple TV) senza lingua esplicita non ci si fida.
 */
export function isItalianForChannel(video: TmdbVideo, channel: OfficialChannel): boolean {
  if (video.iso_639_1 === "it") return true;
  return video.iso_639_1 == null && channel.italian;
}

export interface SearchResult {
  id: string;
  title: string;
  channelId: string;
  /** ISO 8601 (`snippet.publishedAt`). */
  publishedAt: string;
}

export interface RankSearchOptions {
  /** Film: data d'uscita TMDB (`YYYY-MM-DD`); scarta video di oltre due anni prima. */
  releaseDate?: string | null;
  /** Pagina stagione: tiene solo i video che nominano quella stagione. */
  season?: number;
}

const NOT_A_TRAILER =
  /\b(clip|featurette|spot|intervist\w*|backstage|making of|dietro le quinte|scena|recensione|reaction|podcast|live|behind the scenes|promo|bts)\b/i;
const ITALIAN_HINT =
  /\b(ita|italiano|italiana|italian|sub ita|sottotitol\w*|doppiat\w*)\b/i;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function trailerScore(title: string): number {
  if (/trailer\s+ufficiale/i.test(title)) return 3;
  if (/\btrailer\b/i.test(title)) return 2;
  if (/\bteaser\b/i.test(title)) return 1;
  return 0;
}

function mentionsSeason(title: string, season: number): boolean {
  return new RegExp(`\\b(stagione|season|parte|part)\\s*${season}\\b`, "i").test(title);
}

/**
 * Risultati della ricerca YouTube (Data API) filtrati e ordinati: solo canali ufficiali,
 * solo trailer/teaser (niente clip, featurette, spot, interviste), dai canali globali
 * solo titoli che dichiarano l'italiano. Punteggio "Trailer ufficiale" > trailer >
 * teaser; a parità resta l'ordine di rilevanza di YouTube.
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
      if (!channel.italian && !ITALIAN_HINT.test(item.title)) return null;
      if (options.season != null && !mentionsSeason(item.title, options.season))
        return null;
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
