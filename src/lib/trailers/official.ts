import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Enums } from "@/types/database";
import { getOfficialChannelOfVideo } from "./oembed";
import { isItalianForChannel, rankSearchResults, rankTmdbCandidates } from "./rank";
import { searchYouTube } from "./youtube";

/** Una ricerca con risultati vale 30 giorni; una a vuoto si ritenta dopo un giorno. */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;

export interface OfficialTrailerRequest {
  /** `raw.videos` del titolo (o `videos` della stagione). */
  videos: TmdbVideos | undefined;
  titleId: number;
  mediaType: Enums<"media_type">;
  /** 0 = scheda titolo, N = pagina della stagione N. */
  season?: number;
  /** Nome del titolo per la ricerca YouTube; vuoto = salta la ricerca. */
  name: string;
  /** Film: data d'uscita, per scartare trailer di omonimi più vecchi. */
  releaseDate?: string | null;
}

/**
 * Trailer italiani da canali ufficiali dei distributori, in ordine di preferenza.
 *
 * 1. Candidati TMDB (`rankTmdbCandidates`) verificati con oEmbed: tiene solo quelli
 *    caricati da un canale in `OFFICIAL_CHANNELS` e italiani per quel canale.
 * 2. Se nessuno regge e c'è `YOUTUBE_API_KEY`: ricerca YouTube ("<nome> trailer
 *    italiano"), filtrata per canale ufficiale, salvata in `title_trailers`.
 * 3. Altrimenti lista vuota: resta il backdrop, mai un trailer inglese o di terzi.
 *
 * Avvolta in `cache()`: scheda e stagione possono chiederla più volte nel render.
 */
export const getOfficialTrailerKeys = cache(
  async (req: OfficialTrailerRequest): Promise<string[]> => {
    const fromTmdb = await officialFromTmdb(req.videos);
    if (fromTmdb.length > 0) return fromTmdb;
    return officialFromSearch(req);
  },
);

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

async function officialFromSearch(req: OfficialTrailerRequest): Promise<string[]> {
  // senza nome non c'è query (e senza riga in `titles` la FK dell'upsert fallirebbe)
  if (!req.name) return [];
  const season = req.season ?? 0;
  const db = createServiceClient();
  const { data: row } = await db
    .from("title_trailers")
    .select("keys, checked_at")
    .eq("title_id", req.titleId)
    .eq("media_type", req.mediaType)
    .eq("season_number", season)
    .maybeSingle();

  if (row) {
    const age = Date.now() - new Date(row.checked_at).getTime();
    const ttl = row.keys.length > 0 ? FOUND_TTL_MS : EMPTY_RETRY_MS;
    if (age < ttl) return row.keys;
  }

  const query =
    season > 0
      ? `${req.name} stagione ${season} trailer italiano`
      : `${req.name} trailer italiano`;
  const results = await searchYouTube(query);
  // null = niente chiave, errore o quota finita: non si scrive nulla, così una riga
  // vecchia ma valida resta e la ricerca si ritenta alla prossima visita
  if (results === null) return row?.keys ?? [];

  const keys = rankSearchResults(results, {
    releaseDate: req.mediaType === "movie" ? req.releaseDate : null,
    season: season > 0 ? season : undefined,
  }).map((r) => r.id);

  const { error } = await db.from("title_trailers").upsert(
    {
      title_id: req.titleId,
      media_type: req.mediaType,
      season_number: season,
      keys,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "title_id,media_type,season_number" },
  );
  if (error) console.error("[trailers] errore upsert title_trailers:", error);
  return keys;
}
