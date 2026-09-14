import { affinity } from "@/lib/rank/affinity";
import { diversify } from "@/lib/rank/diversity";
import type { RankCandidate, RankedItem } from "@/lib/rank/types";
import type { TasteVector } from "@/lib/rank/vector";

function keyOf(item: { id: number; mediaType: "movie" | "tv" }): string {
  return `${item.mediaType}-${item.id}`;
}

export function rankEligibleSuggestions(
  candidates: readonly RankCandidate[],
  vector: TasteVector,
  allowed: ReadonlySet<string>,
  size: number,
): RankedItem[] {
  const ranked = candidates
    .filter((candidate) => allowed.has(keyOf(candidate)))
    .map((candidate): RankedItem => {
      const result = affinity(vector, candidate);
      return {
        ...candidate,
        punteggio: result.punteggio,
        percentuale: result.percentuale,
        contributi: result.contributi,
        motivo: null,
      };
    })
    .sort(
      (a, b) =>
        b.punteggio - a.punteggio ||
        a.mediaType.localeCompare(b.mediaType) ||
        a.id - b.id,
    );
  return diversify(ranked, size);
}
