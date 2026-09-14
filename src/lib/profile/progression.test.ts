import { describe, expect, it } from "vitest";

import {
  PROGRESSION_LEVELS,
  buildProgression,
  parseProgressionCounts,
} from "./progression";

describe("parseProgressionCounts", () => {
  it("accetta i quattro conteggi interi non negativi dell'RPC", () => {
    expect(
      parseProgressionCounts({ films: 12, series: 3, ratings: 8, reviews: 1 }),
    ).toEqual({ films: 12, series: 3, ratings: 8, reviews: 1 });
  });

  it.each([
    null,
    [],
    {},
    { films: 1, series: 2, ratings: 3 },
    { films: -1, series: 2, ratings: 3, reviews: 4 },
    { films: 1.5, series: 2, ratings: 3, reviews: 4 },
    { films: "1", series: 2, ratings: 3, reviews: 4 },
    { films: Number.MAX_SAFE_INTEGER + 1, series: 2, ratings: 3, reviews: 4 },
  ])("rifiuta un payload RPC malformato: %j", (value) => {
    expect(parseProgressionCounts(value)).toBeNull();
  });
});

describe("buildProgression", () => {
  it.each([
    [{ films: 0, series: 0, ratings: 0, reviews: 0 }, 0, "Spettatore"],
    [{ films: 29, series: 0, ratings: 0, reviews: 0 }, 145, "Spettatore"],
    [{ films: 30, series: 0, ratings: 0, reviews: 0 }, 150, "Appassionato"],
    [{ films: 99, series: 0, ratings: 0, reviews: 0 }, 495, "Appassionato"],
    [{ films: 100, series: 0, ratings: 0, reviews: 0 }, 500, "Esploratore"],
    [{ films: 239, series: 0, ratings: 0, reviews: 0 }, 1_195, "Esploratore"],
    [{ films: 240, series: 0, ratings: 0, reviews: 0 }, 1_200, "Cinefilo"],
    [{ films: 499, series: 0, ratings: 0, reviews: 0 }, 2_495, "Cinefilo"],
    [{ films: 500, series: 0, ratings: 0, reviews: 0 }, 2_500, "Grande cinefilo"],
    [{ films: 500, series: 0, ratings: 750, reviews: 0 }, 4_000, "Cultore del cinema"],
    [{ films: 500, series: 0, ratings: 1_000, reviews: 150 }, 6_000, "Ambasciatore"],
    [
      { films: 500, series: 0, ratings: 1_000, reviews: 400 },
      8_500,
      "Voce della community",
    ],
  ] as const)(
    "assegna il livello alla soglia esatta con %o film",
    (counts, points, level) => {
      const result = buildProgression(counts);

      expect(result.points).toBe(points);
      expect(result.level.name).toBe(level);
    },
  );

  it("espone le otto soglie e il numero di locandine sbloccate", () => {
    expect(PROGRESSION_LEVELS).toEqual([
      { name: "Spettatore", threshold: 0, unlockCount: 4 },
      { name: "Appassionato", threshold: 150, unlockCount: 8 },
      { name: "Esploratore", threshold: 500, unlockCount: 13 },
      { name: "Cinefilo", threshold: 1_200, unlockCount: 18 },
      { name: "Grande cinefilo", threshold: 2_500, unlockCount: 24 },
      { name: "Cultore del cinema", threshold: 4_000, unlockCount: 30 },
      { name: "Ambasciatore", threshold: 6_000, unlockCount: 35 },
      { name: "Voce della community", threshold: 8_500, unlockCount: 40 },
    ]);
  });

  it("applica separatamente i limiti a visioni, voti e recensioni", () => {
    const result = buildProgression({
      films: 20_000,
      series: 20_000,
      ratings: 20_000,
      reviews: 20_000,
    });

    expect(result.breakdown).toEqual({
      views: { points: 2_500, maxPoints: 2_500 },
      ratings: { points: 2_000, maxPoints: 2_000 },
      reviews: { points: 5_000, maxPoints: 5_000 },
    });
    expect(result.points).toBe(9_500);
  });

  it("calcola traguardi ottenuti, mancanti e prossimo obiettivo", () => {
    const result = buildProgression({ films: 25, series: 9, ratings: 25, reviews: 5 });

    expect(result.milestones).toHaveLength(16);
    expect(result.milestones).toContainEqual({
      category: "films",
      threshold: 25,
      label: "25 film",
      achieved: true,
      remaining: 0,
    });
    expect(result.milestones).toContainEqual({
      category: "series",
      threshold: 10,
      label: "10 serie",
      achieved: false,
      remaining: 1,
    });
    expect(result.nextMilestone).toEqual({
      category: "series",
      threshold: 10,
      label: "10 serie",
      achieved: false,
      remaining: 1,
    });
  });

  it("limita la sintesi a tre traguardi realmente ottenuti", () => {
    const result = buildProgression({
      films: 500,
      series: 100,
      ratings: 500,
      reviews: 100,
    });

    expect(result.featuredMilestones).toHaveLength(3);
    expect(result.featuredMilestones.every((milestone) => milestone.achieved)).toBe(true);
    expect(
      new Set(result.featuredMilestones.map((milestone) => milestone.category)).size,
    ).toBe(3);
  });

  it("ricalcola punti e traguardi quando i conteggi diminuiscono", () => {
    const beforeRemoval = buildProgression({
      films: 25,
      series: 0,
      ratings: 0,
      reviews: 5,
    });
    const afterRemoval = buildProgression({
      films: 24,
      series: 0,
      ratings: 0,
      reviews: 0,
    });

    expect(beforeRemoval.points).toBe(175);
    expect(afterRemoval.points).toBe(120);
    expect(
      afterRemoval.milestones.find(
        (milestone) => milestone.category === "films" && milestone.threshold === 25,
      ),
    ).toMatchObject({ achieved: false, remaining: 1 });
    expect(
      afterRemoval.milestones.some(
        (milestone) => milestone.category === "reviews" && milestone.achieved,
      ),
    ).toBe(false);
  });

  it("misura l'avanzamento entro il livello corrente e chiude l'ultimo livello", () => {
    const halfway = buildProgression({
      films: 50,
      series: 0,
      ratings: 0,
      reviews: 0,
    });
    const finalLevel = buildProgression({
      films: 500,
      series: 0,
      ratings: 1_000,
      reviews: 400,
    });

    expect(halfway.nextLevel).toEqual({
      name: "Esploratore",
      threshold: 500,
      unlockCount: 13,
    });
    expect(halfway.pointsToNextLevel).toBe(250);
    expect(halfway.levelProgress).toBeCloseTo(2 / 7);
    expect(finalLevel.nextLevel).toBeNull();
    expect(finalLevel.pointsToNextLevel).toBe(0);
    expect(finalLevel.levelProgress).toBe(1);
  });
});
