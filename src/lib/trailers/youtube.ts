import "server-only";
import type { SearchResult } from "./rank";

const SEARCH_TIMEOUT_MS = 5000;
const MAX_RESULTS = 25;

let warnedMissingKey = false;

/** La ricerca YouTube è opzionale: senza chiave si salta senza errori. */
export function hasYouTubeApiKey(): boolean {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || key.startsWith("INSERISCI")) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.info("[trailers] YOUTUBE_API_KEY assente: nessuna ricerca su YouTube");
    }
    return false;
  }
  return true;
}

interface SearchResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: { title?: string; channelId?: string; publishedAt?: string };
  }[];
}

/**
 * `search.list` della YouTube Data API v3 (100 unità di quota, 10.000/giorno gratis):
 * una sola chiamata per titolo, regione e lingua italiane. Il filtro per canale
 * ufficiale lo fa `rankSearchResults` (l'API accetta un solo `channelId` per chiamata).
 * Null su errore o quota esaurita (403): il chiamante decide se ritentare domani.
 */
export async function searchYouTube(query: string): Promise<SearchResult[] | null> {
  if (!hasYouTubeApiKey()) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(MAX_RESULTS));
  url.searchParams.set("regionCode", "IT");
  url.searchParams.set("relevanceLanguage", "it");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY as string);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[trailers] ricerca YouTube fallita:", res.status, query);
      return null;
    }
    const data = (await res.json()) as SearchResponse;
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
  } catch (err) {
    console.warn(
      "[trailers] ricerca YouTube fallita:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export interface VideoDetails {
  channelId: string;
  audioLanguage: string | null;
  embeddable: boolean;
}

/**
 * `videos.list` (1 unità per chiamata, fino a 50 id): canale esatto, lingua audio
 * dichiarata (`snippet.defaultAudioLanguage`) ed embeddabilità. Serve a promuovere i
 * video dei canali globali (Netflix, Prime Video, Apple TV) che TMDB non marca "it" ma
 * hanno l'audio italiano. Mappa vuota senza chiave o su errore: si resta al giudizio
 * di oEmbed + TMDB.
 */
export async function getVideoDetails(ids: string[]): Promise<Map<string, VideoDetails>> {
  const out = new Map<string, VideoDetails>();
  if (ids.length === 0 || !hasYouTubeApiKey()) return out;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set("id", ids.slice(0, 50).join(","));
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY as string);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      next: { revalidate: 7 * 24 * 60 * 60 },
    });
    if (!res.ok) {
      console.warn("[trailers] videos.list fallito:", res.status);
      return out;
    }
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
  } catch (err) {
    console.warn(
      "[trailers] videos.list fallito:",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}
