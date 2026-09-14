import type { TasteVector } from "@/lib/rank/vector";

const DIMENSIONS = [
  "generi",
  "decenni",
  "provider",
  "persone",
  "tipo",
  "runtime",
  "lingua",
] as const;

export interface ListRecommendationProfile {
  vector: TasteVector;
  contributorCount: number;
  memberCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMap(value: unknown): Map<string, number> | null {
  if (!isRecord(value)) return null;
  const result = new Map<string, number>();
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < -1 || raw > 1) {
      return null;
    }
    result.set(key, raw);
  }
  return result;
}

export function parseListRecommendationProfile(
  raw: unknown,
): ListRecommendationProfile | null {
  if (!isRecord(raw) || !isRecord(raw.vector)) return null;
  const rawVector = raw.vector;
  const maps = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, parseMap(rawVector[dimension])]),
  ) as Record<(typeof DIMENSIONS)[number], Map<string, number> | null>;
  if (DIMENSIONS.some((dimension) => maps[dimension] === null)) return null;
  if (
    typeof raw.fiducia !== "number" ||
    !Number.isFinite(raw.fiducia) ||
    raw.fiducia < 0 ||
    raw.fiducia > 1 ||
    typeof raw.abbastanza !== "boolean" ||
    !Number.isInteger(raw.contributorCount) ||
    (raw.contributorCount as number) < 0 ||
    !Number.isInteger(raw.memberCount) ||
    (raw.memberCount as number) < 1
  ) {
    return null;
  }
  return {
    vector: {
      generi: maps.generi!,
      decenni: maps.decenni!,
      provider: maps.provider!,
      persone: maps.persone!,
      tipo: maps.tipo!,
      runtime: maps.runtime!,
      lingua: maps.lingua!,
      fiducia: raw.fiducia,
      abbastanza: raw.abbastanza,
    },
    contributorCount: raw.contributorCount as number,
    memberCount: raw.memberCount as number,
  };
}
