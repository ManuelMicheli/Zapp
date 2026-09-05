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
