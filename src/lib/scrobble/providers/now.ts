import { parseMedia, stableKey } from "../parse";
import type { ParsedMedia } from "../types";

export interface NowRawMedia {
  titleText: string | null;
  detailText: string | null;
}

/** Parser NOW per le stringhe osservate nelle fixture reali.
 * Numeri esposti dal provider: il matching TMDB deve verificarli separatamente.
 */
export function parseNowMedia(raw: NowRawMedia): ParsedMedia | null {
  if (
    typeof raw.titleText !== "string" ||
    !raw.titleText.trim() ||
    raw.titleText.length > 500 ||
    (raw.detailText !== null &&
      (typeof raw.detailText !== "string" || raw.detailText.length > 500))
  )
    return null;
  // Il film osservato non ha episodeData. Senza dettaglio è un'ipotesi:
  // prima di salvare servirà un titolo esatto TMDB, escludendo le serie incomplete.
  if (raw.detailText === null) return parseMedia(raw.titleText, null, "movie");
  if (!/^S[1-9]\d? E[1-9]\d{0,2}:\s*\S/.test(raw.detailText.trim())) return null;
  const parsed = parseMedia(raw.titleText, raw.detailText, "tv");
  return {
    ...parsed,
    key: stableKey([
      "now",
      parsed.title,
      parsed.season,
      parsed.episode,
      parsed.episodeName,
    ]),
  };
}
