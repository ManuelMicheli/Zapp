export interface ProgressionCounts {
  films: number;
  series: number;
  ratings: number;
  reviews: number;
}

export type VerifiedRole = "critic" | "director" | "actor" | "public_figure";

export interface ProfileRecognition {
  verifiedAt: string | null;
  verifiedRole: VerifiedRole | null;
}

export type ProgressionCategory = keyof ProgressionCounts;

export interface ProgressionLevel {
  name:
    | "Spettatore"
    | "Appassionato"
    | "Esploratore"
    | "Cinefilo"
    | "Grande cinefilo"
    | "Voce della community";
  threshold: number;
}

export interface ProgressionMilestone {
  category: ProgressionCategory;
  threshold: number;
  label: string;
  achieved: boolean;
  remaining: number;
}

export interface ProfileProgression {
  counts: ProgressionCounts;
  points: number;
  breakdown: {
    views: { points: number; maxPoints: 2500 };
    ratings: { points: number; maxPoints: 2000 };
    reviews: { points: number; maxPoints: 5000 };
  };
  level: ProgressionLevel;
  nextLevel: ProgressionLevel | null;
  pointsToNextLevel: number;
  levelProgress: number;
  milestones: ProgressionMilestone[];
  featuredMilestones: ProgressionMilestone[];
  nextMilestone: ProgressionMilestone | null;
}

export const VERIFIED_ROLE_LABELS: Record<VerifiedRole, string> = {
  critic: "Critico/a",
  director: "Regista",
  actor: "Attore/attrice",
  public_figure: "Personaggio pubblico",
};

const LEVELS: readonly ProgressionLevel[] = [
  { name: "Spettatore", threshold: 0 },
  { name: "Appassionato", threshold: 100 },
  { name: "Esploratore", threshold: 400 },
  { name: "Cinefilo", threshold: 1_000 },
  { name: "Grande cinefilo", threshold: 2_500 },
  { name: "Voce della community", threshold: 5_000 },
];

const MILESTONES: Readonly<
  Record<ProgressionCategory, readonly { threshold: number; label: string }[]>
> = {
  films: [
    { threshold: 1, label: "Primo film" },
    { threshold: 25, label: "25 film" },
    { threshold: 100, label: "100 film" },
    { threshold: 500, label: "500 film" },
  ],
  series: [
    { threshold: 1, label: "Prima serie" },
    { threshold: 10, label: "10 serie" },
    { threshold: 50, label: "50 serie" },
    { threshold: 100, label: "100 serie" },
  ],
  ratings: [
    { threshold: 1, label: "Primo voto" },
    { threshold: 25, label: "25 voti" },
    { threshold: 100, label: "100 voti" },
    { threshold: 500, label: "500 voti" },
  ],
  reviews: [
    { threshold: 1, label: "Prima recensione" },
    { threshold: 5, label: "5 recensioni" },
    { threshold: 25, label: "25 recensioni" },
    { threshold: 100, label: "100 recensioni" },
  ],
};

const CATEGORY_ORDER: readonly ProgressionCategory[] = [
  "films",
  "series",
  "ratings",
  "reviews",
];

const FEATURED_CATEGORY_ORDER: readonly ProgressionCategory[] = [
  "reviews",
  "ratings",
  "films",
  "series",
];

export function parseProgressionCounts(value: unknown): ProgressionCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = ["films", "series", "ratings", "reviews"] as const;
  if (
    keys.some((key) => !Number.isSafeInteger(record[key]) || (record[key] as number) < 0)
  ) {
    return null;
  }

  return {
    films: record.films as number,
    series: record.series as number,
    ratings: record.ratings as number,
    reviews: record.reviews as number,
  };
}

export function buildProgression(counts: ProgressionCounts): ProfileProgression {
  const viewPoints = Math.min((counts.films + counts.series) * 5, 2_500);
  const ratingPoints = Math.min(counts.ratings * 2, 2_000);
  const reviewPoints = Math.min(counts.reviews * 10, 5_000);
  const points = viewPoints + ratingPoints + reviewPoints;
  const levelIndex = LEVELS.findLastIndex((candidate) => points >= candidate.threshold);
  const level = LEVELS[levelIndex];
  const nextLevel = LEVELS[levelIndex + 1] ?? null;
  const milestones = CATEGORY_ORDER.flatMap((category) =>
    MILESTONES[category].map(({ threshold, label }) => ({
      category,
      threshold,
      label,
      achieved: counts[category] >= threshold,
      remaining: Math.max(threshold - counts[category], 0),
    })),
  );
  const nextMilestone =
    CATEGORY_ORDER.map((category) =>
      milestones.find(
        (milestone) => milestone.category === category && !milestone.achieved,
      ),
    )
      .filter((milestone): milestone is ProgressionMilestone => Boolean(milestone))
      .sort(
        (a, b) =>
          counts[b.category] / b.threshold - counts[a.category] / a.threshold ||
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      )[0] ?? null;
  const achievedMilestones = milestones.filter((milestone) => milestone.achieved);
  const featuredByCategory = FEATURED_CATEGORY_ORDER.map((category) =>
    achievedMilestones.findLast((milestone) => milestone.category === category),
  ).filter((milestone): milestone is ProgressionMilestone => Boolean(milestone));
  const featuredFallback = achievedMilestones
    .filter((milestone) => !featuredByCategory.includes(milestone))
    .reverse();

  return {
    counts,
    points,
    breakdown: {
      views: { points: viewPoints, maxPoints: 2500 },
      ratings: { points: ratingPoints, maxPoints: 2000 },
      reviews: { points: reviewPoints, maxPoints: 5000 },
    },
    level,
    nextLevel,
    pointsToNextLevel: nextLevel ? nextLevel.threshold - points : 0,
    levelProgress: nextLevel
      ? (points - level.threshold) / (nextLevel.threshold - level.threshold)
      : 1,
    milestones,
    featuredMilestones: [...featuredByCategory, ...featuredFallback].slice(0, 3),
    nextMilestone,
  };
}
