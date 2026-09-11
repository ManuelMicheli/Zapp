import { MATCH_THRESHOLD, playerTitleSimilarity } from "../rank";

/** Numero esplicito di un seguito: non deve sparire nel confronto per somiglianza. */
function sequelNumber(title: string): number | null {
  const token =
    title.match(
      /\b(?:parte|part|capitolo|chapter|volume|vol)\s+(\d{1,2}|[ivx]{1,5})\b/i,
    )?.[1] ?? title.match(/\s+(\d{1,2}|[ivx]{1,5})$/i)?.[1];
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  const values: Record<string, number> = { i: 1, v: 5, x: 10 };
  const digits = [...token.toLowerCase()].map((c) => values[c]);
  return digits.reduce((sum, n, i) => sum + (n < (digits[i + 1] ?? 0) ? -n : n), 0);
}

/** Riusa il confronto Netflix: varianti locali/originali e sottotitoli del distributore. */
export function primeTitleScore(
  playerTitle: string,
  name: string,
  originalName?: string | null,
): number {
  const score = (candidate: string) => {
    const a = sequelNumber(playerTitle),
      b = sequelNumber(candidate);
    if (a !== b && (a !== null || b !== null)) return 0;
    return playerTitleSimilarity(playerTitle, candidate);
  };
  return Math.max(score(name), originalName ? score(originalName) : 0);
}

/** Conta la precisione dei nomi, non la sola presenza di un risultato TV. */
export function primeTvConflict(movieScore: number, tvScore: number): boolean {
  return tvScore >= MATCH_THRESHOLD && tvScore >= movieScore - 0.03;
}
