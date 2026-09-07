/**
 * Le chiamate a YouTube per gli script da riga di comando: stessi endpoint dei moduli
 * dell'app, senza la cache di Next (che vive solo dentro il server Next) e senza
 * `server-only`. La logica di scelta resta una sola, in `src/lib/trailers/compute.ts`.
 */
import sharp from "sharp";
import {
  detectBars,
  frameFromBars,
  FULL_FRAME,
  type Bars,
  type TrailerFrame,
} from "../src/lib/trailers/frame-bars";
import type { VideoAuthor } from "../src/lib/trailers/oembed";
import type { SearchResult } from "../src/lib/trailers/rank";
import type { VideoDetails } from "../src/lib/trailers/youtube";

export async function getVideoAuthorRaw(key: string): Promise<VideoAuthor | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${key}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      author_url?: string;
      author_name?: string;
      title?: string;
    };
    return {
      authorUrl: data.author_url,
      authorName: data.author_name,
      title: data.title,
    };
  } catch {
    return null;
  }
}

export async function getVideoDetailsRaw(
  ids: string[],
): Promise<Map<string, VideoDetails>> {
  const out = new Map<string, VideoDetails>();
  const key = process.env.YOUTUBE_API_KEY;
  if (ids.length === 0 || !key) return out;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set("id", ids.slice(0, 50).join(","));
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      items?: {
        id?: string;
        snippet?: { channelId?: string; defaultAudioLanguage?: string };
        status?: { embeddable?: boolean };
      }[];
    };
    for (const item of data.items ?? []) {
      if (!item.id || !item.snippet?.channelId) continue;
      out.set(item.id, {
        channelId: item.snippet.channelId,
        audioLanguage: item.snippet.defaultAudioLanguage ?? null,
        embeddable: item.status?.embeddable !== false,
      });
    }
  } catch {
    // rete: si resta al giudizio di oEmbed
  }
  return out;
}

/** Una ricerca ogni mezzo secondo: in blocco la Data API risponde 429. */
const SEARCH_GAP_MS = 500;
let lastSearchAt = 0;

/** Null anche sul 403: la quota è finita, chi chiama smette di cercare per oggi. */
export async function searchYouTubeRaw(query: string): Promise<SearchResult[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const wait = lastSearchAt + SEARCH_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearchAt = Date.now();
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("regionCode", "IT");
  url.searchParams.set("relevanceLanguage", "it");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn("[backfill] ricerca YouTube fallita:", res.status, query);
      return null;
    }
    const data = (await res.json()) as {
      items?: {
        id?: { videoId?: string };
        snippet?: { title?: string; channelId?: string; publishedAt?: string };
      }[];
    };
    const results: SearchResult[] = [];
    for (const item of data.items ?? []) {
      const id = item.id?.videoId;
      const s = item.snippet;
      if (!id || !s?.title || !s.channelId) continue;
      results.push({
        id,
        title: s.title,
        channelId: s.channelId,
        publishedAt: s.publishedAt ?? "",
      });
    }
    return results;
  } catch {
    return null;
  }
}

/**
 * Riquadro dell'immagine reale di un video (bande nere escluse), calcolato come in
 * `src/lib/trailers/frame.ts` ma con `fetch` semplice: `unstable_cache` vive solo dentro
 * Next. Le funzioni che misurano le bande sono le stesse, pure e testate.
 */
const THUMBS = ["mq1", "mq2", "mq3"];

async function readBarsRaw(key: string, name: string): Promise<Bars | null> {
  const res = await fetch(`https://i.ytimg.com/vi/${key}/${name}.jpg`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectBars(data, info.width, info.height);
}

export async function trailerFrameRaw(key: string): Promise<TrailerFrame> {
  try {
    const bars = await Promise.all(
      THUMBS.map((name) => readBarsRaw(key, name).catch(() => null)),
    );
    return frameFromBars(bars);
  } catch {
    return FULL_FRAME;
  }
}
