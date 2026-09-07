/**
 * Le regole pure della cache dei consigli: scadenze e validazione del JSON letto da
 * `title_similar`. Stanno fuori da `store.ts` perché quello è `server-only` e Vitest
 * non lo può importare — stessa divisione di `trailers/stored.ts`.
 */

import type { Json } from "@/types/database";
import type { SimilarItem } from "./types";

/** Una classifica piena resta buona un mese. */
export const SIMILAR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Una vuota si ritenta dopo tre giorni: di solito è un titolo appena annunciato,
 * ancora senza keyword né voti. Fra tre giorni può avere entrambi.
 */
export const SIMILAR_EMPTY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface StoredSimilar {
  items: SimilarItem[];
  computedAt: string;
}

/**
 * Valida il JSON letto dal DB. Una forma diversa da quella attesa torna `null`, che
 * per il chiamante vuol dire "ricalcola": è anche il modo in cui un cambio di forma
 * invalida la cache da sé, senza migrazioni di dati.
 */
export function parseSimilar(value: Json): SimilarItem[] | null {
  if (!Array.isArray(value)) return null;
  const out: SimilarItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const mediaType = item.mediaType;
    if (typeof item.id !== "number") return null;
    if (mediaType !== "movie" && mediaType !== "tv") return null;
    if (typeof item.title !== "string") return null;
    if (typeof item.score !== "number") return null;
    if (item.posterPath != null && typeof item.posterPath !== "string") return null;
    if (item.reason != null && typeof item.reason !== "string") return null;
    const keywordIds = item.keywordIds;
    const genreIds = item.genreIds;
    if (!Array.isArray(keywordIds) || !Array.isArray(genreIds)) return null;
    out.push({
      id: item.id,
      mediaType,
      title: item.title,
      posterPath: (item.posterPath as string | null) ?? null,
      year: typeof item.year === "number" ? item.year : null,
      score: item.score,
      reason: (item.reason as string | null) ?? null,
      directorId: typeof item.directorId === "number" ? item.directorId : null,
      keywordIds: keywordIds.filter((id): id is number => typeof id === "number"),
      genreIds: genreIds.filter((id): id is number => typeof id === "number"),
    });
  }
  return out;
}

/** Una riga è fresca finché non scade: le liste vuote scadono molto prima. */
export function isFresh(
  computedAt: string,
  items: SimilarItem[],
  now = Date.now(),
): boolean {
  const age = now - new Date(computedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  return age < (items.length > 0 ? SIMILAR_TTL_MS : SIMILAR_EMPTY_TTL_MS);
}
