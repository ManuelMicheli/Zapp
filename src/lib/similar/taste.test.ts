import { describe, expect, it } from "vitest";
import { applyTaste, tasteProfile } from "./taste";
import type { SeedProfile, SimilarItem } from "./types";

function seed(over: Partial<SeedProfile> = {}): SeedProfile {
  return {
    id: 1,
    mediaType: "movie",
    year: 2024,
    keywords: [],
    collectionId: null,
    directors: [],
    writers: [],
    cast: [],
    genreIds: [],
    ...over,
  };
}

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

const nolan = { id: 20, name: "Christopher Nolan" };
const seeds: SeedProfile[] = [
  seed({ directors: [nolan], keywords: [{ id: 10, name: "heist" }] }),
  seed({ directors: [nolan], keywords: [{ id: 10, name: "heist" }] }),
  seed({ directors: [{ id: 21, name: "Altro" }] }),
];

describe("tasteProfile", () => {
  it("tiene solo ciò che ricorre: due volte, non una", () => {
    const taste = tasteProfile(seeds);
    expect([...taste.directorIds]).toEqual([20]);
    expect([...taste.keywordIds]).toEqual([10]);
  });

  it("con un titolo solo non si deduce niente", () => {
    const taste = tasteProfile([seeds[0]]);
    expect(taste.directorIds.size).toBe(0);
    expect(taste.keywordIds.size).toBe(0);
  });

  it("una keyword ripetuta nello stesso titolo non conta due volte", () => {
    const taste = tasteProfile([
      seed({
        keywords: [
          { id: 10, name: "heist" },
          { id: 10, name: "heist" },
        ],
      }),
    ]);
    expect(taste.keywordIds.size).toBe(0);
  });
});

describe("applyTaste", () => {
  const taste = tasteProfile(seeds);

  it("il regista che l'utente segue passa avanti", () => {
    const out = applyTaste([item({ id: 2 }), item({ id: 3, directorId: 20 })], taste);
    expect(out[0].id).toBe(3);
  });

  it("le keyword che ricorrono nel gusto spingono in avanti", () => {
    const out = applyTaste([item({ id: 2 }), item({ id: 3, keywordIds: [10] })], taste);
    expect(out[0].id).toBe(3);
  });

  it("ciò che è già in libreria sparisce", () => {
    const out = applyTaste(
      [item({ id: 2 }), item({ id: 3 })],
      taste,
      new Set(["movie-2"]),
    );
    expect(out.map((i) => i.id)).toEqual([3]);
  });

  it("un seme molto amato tira su tutto il suo filone", () => {
    const senza = applyTaste([item()], taste, new Set(), null)[0].score;
    const con = applyTaste([item()], taste, new Set(), 9)[0].score;
    expect(con).toBeGreaterThan(senza);
  });

  it("senza gusto la lista resta com'era, ordine compreso", () => {
    const vuoto = tasteProfile([]);
    const out = applyTaste([item({ id: 3, score: 2 }), item({ id: 2, score: 5 })], vuoto);
    expect(out.map((i) => i.id)).toEqual([2, 3]);
  });
});
