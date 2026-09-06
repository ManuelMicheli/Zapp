import "server-only";
import { matchOfficialChannel, type OfficialChannel } from "./channels";

const OEMBED_TIMEOUT_MS = 3000;
/** Il canale di un video non cambia: cache Next lunga. */
const OEMBED_REVALIDATE_S = 30 * 24 * 60 * 60;

interface OEmbed {
  author_name?: string;
  author_url?: string;
}

export interface VideoAuthor {
  authorUrl: string | undefined;
  authorName: string | undefined;
}

/**
 * Autore di un video YouTube via oEmbed (nessuna chiave, nessuna quota): `author_url`
 * porta l'handle del canale. Null se il video non è più disponibile o non è embeddabile
 * (privato/rimosso → 4xx, embed disattivato → 401): così un trailer morto cade da solo.
 */
export async function getVideoAuthor(key: string): Promise<VideoAuthor | null> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${key}`);
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      next: { revalidate: OEMBED_REVALIDATE_S },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbed;
    return { authorUrl: data.author_url, authorName: data.author_name };
  } catch (err) {
    console.warn(
      "[trailers] oEmbed fallito per",
      key,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Canale ufficiale di un video: null se il canale non è in allowlist o il video è morto. */
export async function getOfficialChannelOfVideo(
  key: string,
): Promise<OfficialChannel | null> {
  const author = await getVideoAuthor(key);
  return author ? matchOfficialChannel(author) : null;
}
