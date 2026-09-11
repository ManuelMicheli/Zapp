import { samePrimeName } from "./prime-resolve";
import type { ParsedMedia } from "../types";

// Alias verificati sulle sonde e sul catalogo TMDB il 10/09/2026.
// Il ramo Thousand-Year Blood War appartiene a Bleach, non a una nuova serie TMDB.
const ALIASES = [
  { title: "BLEACH: Thousand-Year Blood War", id: 30984 },
  { title: "Made in Korea", id: 246473 },
] as const;
export function disneyCatalogMatch(parsed: ParsedMedia) {
  if (parsed.kind !== "tv") return null;
  const alias = ALIASES.find((a) => samePrimeName(parsed.title, a.title));
  return alias ? { titleId: alias.id, mediaType: "tv" as const } : null;
}

// TMDB non ha nomi episodio per Made in Korea neppure in inglese. Le tre
// corrispondenze osservate sono esplicite; nessun fallback globale sui numeri.
export function disneyKnownEpisode(parsed: ParsedMedia, titleId: number) {
  if (
    titleId !== 246473 ||
    parsed.kind !== "tv" ||
    parsed.season !== 1 ||
    !parsed.episodeName
  )
    return null;
  const names = ["Businessman", "Le unghie del cane", "Il proibizionismo"];
  const index = names.findIndex((n) => samePrimeName(n, parsed.episodeName!));
  return index >= 0 && parsed.episode === index + 1
    ? { season: 1, episode: index + 1 }
    : null;
}
