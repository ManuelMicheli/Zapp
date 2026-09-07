import { describe, expect, it } from "vitest";
import { isFresh, parseSimilar, SIMILAR_EMPTY_TTL_MS, SIMILAR_TTL_MS } from "./stored";
import type { SimilarItem } from "./types";

const item = {
  id: 2,
  mediaType: "movie",
  title: "Heat",
  posterPath: "/p.jpg",
  year: 1995,
  score: 4.2,
  reason: "Rapina",
  directorId: 20,
  keywordIds: [10],
  genreIds: [28],
};

describe("parseSimilar", () => {
  it("legge la forma attesa", () => {
    expect(parseSimilar([item])).toHaveLength(1);
    expect(parseSimilar([])).toEqual([]);
  });

  it("una forma diversa vale come 'ricalcola', non come lista vuota", () => {
    expect(parseSimilar(null)).toBeNull();
    expect(parseSimilar({ items: [] })).toBeNull();
    expect(parseSimilar([{ ...item, id: "2" }])).toBeNull();
    expect(parseSimilar([{ ...item, mediaType: "person" }])).toBeNull();
    expect(parseSimilar([{ ...item, score: null }])).toBeNull();
    expect(parseSimilar([{ ...item, keywordIds: 10 }])).toBeNull();
  });

  it("i campi facoltativi possono mancare", () => {
    const parsed = parseSimilar([
      { ...item, posterPath: null, reason: null, year: null, directorId: null },
    ]);
    expect(parsed?.[0].reason).toBeNull();
  });
});

describe("isFresh", () => {
  const now = Date.now();
  const items = [item as SimilarItem];

  it("una classifica piena vale un mese", () => {
    expect(isFresh(new Date(now - SIMILAR_TTL_MS + 1000).toISOString(), items, now)).toBe(
      true,
    );
    expect(isFresh(new Date(now - SIMILAR_TTL_MS - 1000).toISOString(), items, now)).toBe(
      false,
    );
  });

  it("una vuota si ritenta molto prima", () => {
    const justOver = new Date(now - SIMILAR_EMPTY_TTL_MS - 1000).toISOString();
    expect(isFresh(justOver, [], now)).toBe(false);
    expect(isFresh(justOver, items, now)).toBe(true);
  });

  it("una data impossibile non è mai fresca", () => {
    expect(isFresh("non è una data", items, now)).toBe(false);
    expect(isFresh(new Date(now + 60_000).toISOString(), items, now)).toBe(false);
  });
});
