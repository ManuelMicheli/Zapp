import { parseMedia, stableKey } from "../parse";
import type { ParsedMedia } from "../types";

/** Stringhe grezze distinte: titolo e fratello immediatamente successivo nel player. */
export interface PrimeRawMedia {
  titleText: string | null;
  detailText: string | null;
}

/** Numeri del provider: non equivalgono ancora a numeri TMDB verificati. */
export function parsePrimeMedia(raw: PrimeRawMedia): ParsedMedia | null {
  if (
    typeof raw.titleText !== "string" ||
    !raw.titleText.trim() ||
    raw.titleText.length > 500 ||
    (raw.detailText !== null &&
      (typeof raw.detailText !== "string" || raw.detailText.length > 500))
  )
    return null;
  // Round 1: "Come un tuono" compare da solo nel player. E' solo un'ipotesi
  // film: l'ingest richiede il titolo TMDB esatto e scarta le serie senza episodio.
  if (!raw.detailText?.trim()) return parseMedia(raw.titleText, null, "movie");
  // Solo il formato osservato; una preview "Episodio successivo S4 E3" è esclusa.
  if (!/^S[1-9]\d?\s+E[1-9]\d{0,2}(?:\s|$)/i.test(raw.detailText.trim())) return null;
  const parsed = parseMedia(raw.titleText, raw.detailText, "tv");
  return {
    ...parsed,
    key: stableKey([
      "prime",
      parsed.title,
      parsed.season,
      parsed.episode,
      parsed.episodeName,
    ]),
  };
}
