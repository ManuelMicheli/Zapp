/**
 * La scala dei trailer, con le chiamate a YouTube iniettate: nessun `server-only`, così
 * l'intera scala è coperta da Vitest ed è riusabile dallo script di backfill.
 *
 * 1. video TMDB in italiano da canale ufficiale;
 * 2. ricerca YouTube "<nome> trailer italiano", canale ufficiale e verifica dura del
 *    titolo (`match.ts`);
 * 3. video TMDB in altra lingua da canale ufficiale, dichiarato in pagina;
 * 4. niente: resta il fondale.
 *
 * Il gradino 3 non costa nulla — i video TMDB sono già stati letti e classificati al
 * gradino 1 — quindi il gradino 2 può permettersi di andare prima: un trailer italiano
 * da canale ufficiale batte sempre un trailer inglese. La ricerca costa però 100 unità
 * di quota su 10.000 al giorno, e `shouldSearch` la raziona: tre tentativi per titolo.
 */
import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";
import {
  getOfficialChannel,
  matchOfficialChannel,
  type OfficialChannel,
} from "./channels";
import type { TrailerLang } from "./frame-bars";
import { videoContradictsTitle, type TitleIdentity } from "./match";
import type { VideoAuthor } from "./oembed";
import {
  isItalianForChannel,
  rankSearchResults,
  rankTmdbCandidates,
  type SearchResult,
} from "./rank";
import type { VideoDetails } from "./youtube";

/** Tentativi di ricerca YouTube concessi a un titolo, in tutta la sua vita. */
export const MAX_SEARCH_TRIES = 3;
/** Attesa prima del primo, del secondo e del terzo tentativo. */
const RETRY_AFTER_MS = [0, 7 * 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000];

export interface TrailerDeps {
  getVideoAuthor(key: string): Promise<VideoAuthor | null>;
  getVideoDetails(ids: string[]): Promise<Map<string, VideoDetails>>;
  searchYouTube(query: string): Promise<SearchResult[] | null>;
}

export interface ComputeRequest {
  videos: TmdbVideos | undefined;
  identity: TitleIdentity;
  releaseDate?: string | null;
  /** Nome del titolo per la ricerca YouTube; vuoto = niente ricerca. */
  name: string;
  /** Ultimo tentativo di ricerca salvato in `title_trailers`. */
  searchAt: string | null;
  /** Tentativi di ricerca già spesi. */
  searchTries: number;
}

export interface ComputeResult {
  keys: string[];
  lang: TrailerLang;
  source: "tmdb" | "youtube" | "none";
  /** Vero se è stata spesa una ricerca: chi salva aggiorna `search_at`/`search_tries`. */
  searched: boolean;
}

/** Si può spendere una ricerca per questo titolo adesso? */
export function shouldSearch(input: {
  searchAt: string | null;
  searchTries: number;
  now: number;
}): boolean {
  if (input.searchTries >= MAX_SEARCH_TRIES) return false;
  const wait = RETRY_AFTER_MS[input.searchTries] ?? 0;
  if (wait === 0 || !input.searchAt) return true;
  const last = Date.parse(input.searchAt);
  if (Number.isNaN(last)) return true;
  return input.now - last >= wait;
}

interface Classified {
  /** Chiavi dei video italiani, in ordine di preferenza. */
  it: string[];
  /** Chiavi degli altri, il ripiego etichettato. */
  other: string[];
}

/**
 * Video TMDB divisi per lingua, tenendo solo quelli da canale ufficiale, embeddabili e
 * che non smentiscono il titolo. oEmbed dà autore, nome del video e vitalità;
 * `videos.list` (con la chiave YouTube) aggiunge id canale esatto, lingua audio ed
 * embeddabilità.
 */
async function classifyTmdbVideos(
  req: ComputeRequest,
  deps: TrailerDeps,
): Promise<Classified> {
  const candidates = rankTmdbCandidates(req.videos);
  const out: Classified = { it: [], other: [] };
  if (candidates.length === 0) return out;
  const [authors, details] = await Promise.all([
    Promise.all(candidates.map((v) => deps.getVideoAuthor(v.key))),
    deps.getVideoDetails(candidates.map((v) => v.key)),
  ]);
  candidates.forEach((video: TmdbVideo, i: number) => {
    const author = authors[i];
    if (!author) return;
    const detail = details.get(video.key);
    if (detail && !detail.embeddable) return;
    const channel: OfficialChannel | null =
      (detail && getOfficialChannel(detail.channelId)) ?? matchOfficialChannel(author);
    if (!channel) return;
    // TMDB associa il video al titolo, ma se il nome YouTube nomina un'altra opera il
    // video non compare: la regola è che un trailer sbagliato non passi mai.
    if (author.title && videoContradictsTitle(author.title, req.identity, channel.name)) {
      return;
    }
    if (isItalianForChannel(video, channel, detail?.audioLanguage))
      out.it.push(video.key);
    else out.other.push(video.key);
  });
  return out;
}

/** La ricerca del gradino 2: chiavi italiane verificate, o null se non ha potuto girare. */
async function searchItalian(
  req: ComputeRequest,
  deps: TrailerDeps,
): Promise<string[] | null> {
  const season = req.identity.season ?? 0;
  const query =
    season > 0
      ? `${req.name} stagione ${season} trailer italiano`
      : `${req.name} trailer italiano`;
  const results = await deps.searchYouTube(query);
  // null = niente chiave, errore di rete o quota finita
  if (results === null) return null;

  // lingua audio dei risultati dei canali globali (senza "ita" nel titolo non passerebbero)
  const globalIds = results
    .filter((r) => getOfficialChannel(r.channelId)?.italian === false)
    .map((r) => r.id);
  const details = await deps.getVideoDetails(globalIds);
  const enriched = results.map((r) => {
    const d = details.get(r.id);
    return d ? { ...r, audioLanguage: d.audioLanguage } : r;
  });
  return rankSearchResults(enriched, {
    releaseDate: req.identity.mediaType === "movie" ? req.releaseDate : null,
    identity: req.identity,
  })
    .filter((r) => details.get(r.id)?.embeddable !== false)
    .map((r) => r.id);
}

/**
 * Chiavi dei trailer, lingua e provenienza. Null solo quando la ricerca era l'unica
 * strada ed è fallita (quota, rete): il chiamante decide se tenere la riga vecchia.
 */
export async function computeTrailers(
  req: ComputeRequest,
  deps: TrailerDeps,
): Promise<ComputeResult | null> {
  const fromTmdb = await classifyTmdbVideos(req, deps);
  if (fromTmdb.it.length > 0) {
    return { keys: fromTmdb.it, lang: "it", source: "tmdb", searched: false };
  }

  let searched = false;
  if (
    req.name &&
    shouldSearch({
      searchAt: req.searchAt,
      searchTries: req.searchTries,
      now: Date.now(),
    })
  ) {
    const keys = await searchItalian(req, deps);
    if (keys === null) {
      // senza un ripiego inglese in mano non si scrive nulla: si ritenta più tardi
      if (fromTmdb.other.length === 0) return null;
    } else {
      searched = true;
      if (keys.length > 0) return { keys, lang: "it", source: "youtube", searched };
    }
  }

  if (fromTmdb.other.length > 0) {
    return { keys: fromTmdb.other, lang: "en", source: "tmdb", searched };
  }
  return { keys: [], lang: "it", source: "none", searched };
}
