import { describe, expect, it } from "vitest";
import { auraForCounts, auraForRank, rankForLevelName } from "./aura";
import { PROGRESSION_LEVELS } from "./progression";

describe("auraForRank", () => {
  it("dà una tinta per ogni livello del percorso", () => {
    for (let rank = 0; rank < PROGRESSION_LEVELS.length; rank++) {
      const aura = auraForRank(rank);
      expect(aura.rgb).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(aura.alpha).toBeGreaterThan(0);
    }
  });

  it("sale di intensità salendo di livello", () => {
    const alfe = PROGRESSION_LEVELS.map((_, rank) => auraForRank(rank).alpha);
    for (let i = 1; i < alfe.length; i++) expect(alfe[i]).toBeGreaterThan(alfe[i - 1]);
  });

  it("tiene i ranghi fuori scala agli estremi invece di restituire undefined", () => {
    expect(auraForRank(-3)).toEqual(auraForRank(0));
    expect(auraForRank(99)).toEqual(auraForRank(PROGRESSION_LEVELS.length - 1));
  });
});

describe("auraForCounts", () => {
  it("senza conteggi non c'è aura: la testata torna al muro di locandine", () => {
    expect(auraForCounts(null)).toBeNull();
  });

  it("un profilo appena nato prende il primo livello", () => {
    expect(auraForCounts({ films: 0, series: 0, ratings: 0, reviews: 0 })).toEqual(
      auraForRank(0),
    );
  });

  // 8.500 punti si toccano solo con le recensioni: visioni e voti si fermano a
  // 2.500 e 2.000, quindi servono ~500 recensioni per l'ultimo livello.
  it("una libreria da capogiro prende l'ultimo", () => {
    expect(
      auraForCounts({ films: 800, series: 200, ratings: 1200, reviews: 600 }),
    ).toEqual(auraForRank(PROGRESSION_LEVELS.length - 1));
  });
});

describe("rankForLevelName", () => {
  it("trova ogni livello per nome", () => {
    PROGRESSION_LEVELS.forEach((level, rank) => {
      expect(rankForLevelName(level.name)).toBe(rank);
    });
  });

  it("dà -1 per un nome che non esiste", () => {
    expect(rankForLevelName("Sconosciuto")).toBe(-1);
  });
});
