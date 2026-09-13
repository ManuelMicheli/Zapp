import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import type { MediaType, WatchAction } from "./dto";

export interface WatchBody {
  titleId: number;
  mediaType: MediaType;
  action: WatchAction;
  season: number | null;
  episode: number | null;
  rating: number | null;
}

const AZIONI: WatchAction[] = [
  "want",
  "watching",
  "watched",
  "drop",
  "remove",
  "episode",
  "rate",
];

export function parseWatchBody(body: unknown): WatchBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isTmdbId(b.titleId) || !isMediaType(b.mediaType)) return null;
  if (typeof b.action !== "string" || !AZIONI.includes(b.action as WatchAction))
    return null;
  const action = b.action as WatchAction;

  const season = isIntInRange(b.season, 1, 200) ? b.season : null;
  const episode = isIntInRange(b.episode, 1, 2000) ? b.episode : null;
  const rating = isIntInRange(b.rating, 1, 10) ? b.rating : null;

  if (
    action === "episode" &&
    (b.mediaType !== "tv" || season === null || episode === null)
  )
    return null;
  if (action === "rate" && rating === null) return null;

  return { titleId: b.titleId, mediaType: b.mediaType, action, season, episode, rating };
}
