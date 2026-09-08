import { describe, expect, it } from "vitest";
import { applyAffinity, blendAffinity } from "./personal-rank";
import type { SimilarItem } from "./types";

function item(over: Partial<SimilarItem> = {}): SimilarItem {
  return {
    id: 2,
    mediaType: "movie",
    title: "Titolo",
    posterPath: "/p.jpg",
    year: 2023,
    score: 3,
    reason: null,
    directorId: null,
    keywordIds: [],
    genreIds: [],
    ...over,
  };
}

describe("blendAffinity", () => {
  it("resta dentro la stessa banda della qualità: 0,75-1,25", () => {
    expect(blendAffinity(3, 0)).toBeCloseTo(2.25);
    expect(blendAffinity(3, 1)).toBeCloseTo(3.75);
  });

  it("senza affinità il punteggio non si tocca", () => {
    expect(blendAffinity(3, null)).toBe(3);
    expect(blendAffinity(3, Number.NaN)).toBe(3);
  });

  it("l'affinità non ribalta un divario di filone", () => {
    // Filone doppio resta davanti anche con affinità nulla contro affinità piena:
    // lo scaffale si chiama "Perché hai visto X", non "cose che ti piacciono".
    expect(blendAffinity(6, 0)).toBeGreaterThan(blendAffinity(3, 1));
  });
});

describe("applyAffinity", () => {
  it("a filone quasi pari, decide il gusto", () => {
    const affinita = new Map([
      ["movie-2", 0.2],
      ["movie-3", 0.9],
    ]);
    const out = applyAffinity(
      [item({ id: 2, score: 3.1 }), item({ id: 3, score: 3 })],
      affinita,
    );
    expect(out.map((i) => i.id)).toEqual([3, 2]);
  });

  it("ciò che è già in libreria sparisce", () => {
    const out = applyAffinity(
      [item({ id: 2 }), item({ id: 3 })],
      new Map(),
      new Set(["movie-2"]),
    );
    expect(out.map((i) => i.id)).toEqual([3]);
  });

  it("senza profilo l'ordine pubblico resta intatto", () => {
    const out = applyAffinity(
      [item({ id: 3, score: 2 }), item({ id: 2, score: 5 })],
      new Map(),
    );
    expect(out.map((i) => i.id)).toEqual([2, 3]);
  });

  it("l'ordine è deterministico a pari punteggio", () => {
    const a = item({ id: 9, score: 3 });
    const b = item({ id: 3, score: 3 });
    expect(applyAffinity([a, b], new Map()).map((i) => i.id)).toEqual([3, 9]);
    expect(applyAffinity([b, a], new Map()).map((i) => i.id)).toEqual([3, 9]);
  });
});
