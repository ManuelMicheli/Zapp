import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Enums, Json } from "@/types/database";
import { withFrames, type Trailer } from "./frame";
import { getOfficialChannelOfVideo } from "./oembed";
import { isItalianForChannel, rankSearchResults, rankTmdbCandidates } from "./rank";
import { parseTrailers } from "./stored";
import { searchYouTube } from "./youtube";

/** Una riga piena vale 30 giorni; una vuota si ritenta dopo un giorno. */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;

type TrailerSource = "tmdb" | "youtube" | "none";

export interface OfficialTrailerRequest {
  /** `raw.videos` del titolo (o `videos` della stagione). */
  videos: TmdbVideos | undefined;
  titleId: number;
  mediaType: Enums<"media_type">;
  /** 0 = scheda titolo, N = pagina della stagione N. */
  season?: number;
  /**
   * Nome del titolo per la ricerca YouTube; vuoto = niente ricerca e niente cache DB
   * (senza riga in `titles` la FK di `title_trailers` fallirebbe).
   */
  name: string;
  /** Film: data d'uscita, per scartare trailer di omonimi più vecchi. */
  releaseDate?: string | null;
}

/**
 * Trailer italiani da canali ufficiali dei distributori, in ordine di preferenza, con
 * il riquadro dell'immagine reale di ogni video (bande nere escluse, `frame.ts`).
 *
 * **DB-first**: ogni visita fa una sola lettura di `title_trailers`; la lista si
 * ricalcola solo a riga assente o scaduta (30 giorni se piena, 1 giorno se vuota:
 * il trailer di un film in uscita arriva dopo). Così il primo chunk della scheda non
 * aspetta mai oEmbed, miniature o ricerca YouTube, e la banda della testata (che prende
 * la forma dal riquadro) non cambia altezza dopo il render.
 *
 * Ricalcolo: 1. candidati TMDB (`rankTmdbCandidates`) verificati con oEmbed, solo canali
 * in `OFFICIAL_CHANNELS` e italiani per quel canale (`source` "tmdb"); 2. altrimenti,
 * con `YOUTUBE_API_KEY`, una ricerca "<nome> trailer italiano" filtrata per canale
 * ufficiale ("youtube"); 3. altrimenti lista vuota ("none"): resta il backdrop, mai un
 * trailer inglese o di terzi. Se la ricerca fallisce (quota, rete) e c'è una riga
 * vecchia, si tiene quella senza riscriverla.
 *
 * Avvolta in `cache()`: scheda e stagione possono chiederla più volte nel render.
 */
export const getOfficialTrailers = cache(
  async (req: OfficialTrailerRequest): Promise<Trailer[]> => {
    const persist = Boolean(req.name);
    const season = req.season ?? 0;
    const db = persist ? createServiceClient() : null;

    const row = db
      ? (
          await db
            .from("title_trailers")
            .select("trailers, keys, checked_at")
            .eq("title_id", req.titleId)
            .eq("media_type", req.mediaType)
            .eq("season_number", season)
            .maybeSingle()
        ).data
      : null;
    // riga del codice precedente (solo `keys`, `trailers` al default vuoto): da ricalcolare
    const legacy =
      row !== null && row.keys.length > 0 && parseTrailers(row.trailers)?.length === 0;
    const cached = row && !legacy ? parseTrailers(row.trailers) : null;
    if (row && cached && isFresh(row.checked_at, cached.length)) return cached;

    const computed = await computeTrailers(req);
    // ricerca fallita (quota, rete): la riga vecchia, se c'è, vale più di niente
    if (computed === null) return cached ?? [];

    const { keys, source } = computed;
    const trailers = await withFrames(keys);
    if (db) {
      const { error } = await db.from("title_trailers").upsert(
        {
          title_id: req.titleId,
          media_type: req.mediaType,
          season_number: season,
          keys,
          trailers: trailers as unknown as Json,
          source,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "title_id,media_type,season_number" },
      );
      if (error) console.error("[trailers] errore upsert title_trailers:", error);
    }
    return trailers;
  },
);

/** Solo le chiavi YouTube, per chi non ha bisogno del riquadro. */
export const getOfficialTrailerKeys = cache(
  async (req: OfficialTrailerRequest): Promise<string[]> =>
    (await getOfficialTrailers(req)).map((t) => t.key),
);

function isFresh(checkedAt: string, count: number): boolean {
  const age = Date.now() - new Date(checkedAt).getTime();
  return age < (count > 0 ? FOUND_TTL_MS : EMPTY_RETRY_MS);
}

/**
 * Chiavi dei trailer ufficiali e da dove vengono. Null solo quando la ricerca YouTube
 * era necessaria ma è fallita: il chiamante decide se tenere la riga vecchia.
 */
async function computeTrailers(
  req: OfficialTrailerRequest,
): Promise<{ keys: string[]; source: TrailerSource } | null> {
  const fromTmdb = await officialFromTmdb(req.videos);
  if (fromTmdb.length > 0) return { keys: fromTmdb, source: "tmdb" };
  if (!req.name) return { keys: [], source: "none" };

  const season = req.season ?? 0;
  const query =
    season > 0
      ? `${req.name} stagione ${season} trailer italiano`
      : `${req.name} trailer italiano`;
  const results = await searchYouTube(query);
  // null = niente chiave, errore o quota finita
  if (results === null) return null;

  const keys = rankSearchResults(results, {
    releaseDate: req.mediaType === "movie" ? req.releaseDate : null,
    season: season > 0 ? season : undefined,
  }).map((r) => r.id);
  return { keys, source: keys.length > 0 ? "youtube" : "none" };
}

async function officialFromTmdb(videos: TmdbVideos | undefined): Promise<string[]> {
  const candidates = rankTmdbCandidates(videos);
  if (candidates.length === 0) return [];
  const channels = await Promise.all(
    candidates.map((v) => getOfficialChannelOfVideo(v.key)),
  );
  const keys: string[] = [];
  candidates.forEach((video, i) => {
    const channel = channels[i];
    if (channel && isItalianForChannel(video, channel)) keys.push(video.key);
  });
  return keys;
}
