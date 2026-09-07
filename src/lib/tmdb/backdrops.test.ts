import { describe, expect, it } from "vitest";
import { MAX_BACKDROPS, pickRotating, rankBackdrops } from "./backdrops";
import type { TmdbImage } from "./types";

function img(p: Partial<TmdbImage> & { file_path: string }): TmdbImage {
  return { width: 3840, height: 2160, vote_average: 5, iso_639_1: null, ...p };
}

describe("rankBackdrops", () => {
  it("mette davanti le grafiche senza scritte", () => {
    const out = rankBackdrops([
      img({ file_path: "/it.jpg", iso_639_1: "it", vote_average: 9 }),
      img({ file_path: "/pulita.jpg", vote_average: 1 }),
    ]);
    expect(out).toEqual(["/pulita.jpg", "/it.jpg"]);
  });

  it("a parità di lingua ordina per voto e poi per larghezza", () => {
    const out = rankBackdrops([
      img({ file_path: "/b.jpg", vote_average: 5, width: 3840 }),
      img({ file_path: "/a.jpg", vote_average: 8 }),
      img({ file_path: "/c.jpg", vote_average: 5, width: 1920 }),
    ]);
    expect(out).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
  });

  it("scarta le grafiche troppo piccole", () => {
    const out = rankBackdrops([
      img({ file_path: "/piccola.jpg", width: 1280, vote_average: 9 }),
      img({ file_path: "/grande.jpg", vote_average: 1 }),
    ]);
    expect(out).toEqual(["/grande.jpg"]);
  });

  it("se nessuna è abbastanza grande le tiene comunque", () => {
    const out = rankBackdrops([img({ file_path: "/piccola.jpg", width: 780 })]);
    expect(out).toEqual(["/piccola.jpg"]);
  });

  it("non supera il tetto", () => {
    const many = Array.from({ length: MAX_BACKDROPS + 5 }, (_, i) =>
      img({ file_path: `/${i}.jpg` }),
    );
    expect(rankBackdrops(many)).toHaveLength(MAX_BACKDROPS);
  });

  it("elenco vuoto → nessuna grafica", () => {
    expect(rankBackdrops([])).toEqual([]);
  });
});

describe("pickRotating", () => {
  it("gira sull'elenco al crescere del seme", () => {
    const items = ["a", "b", "c"];
    expect([0, 1, 2, 3].map((s) => pickRotating(items, s))).toEqual(["a", "b", "c", "a"]);
  });

  it("regge semi negativi", () => {
    expect(pickRotating(["a", "b", "c"], -1)).toBe("c");
  });

  it("elenco vuoto → null", () => {
    expect(pickRotating([], 3)).toBeNull();
  });
});
