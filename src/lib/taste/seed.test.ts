import { describe, expect, it } from "vitest";
import {
  parseSeedKey,
  pickSeedGrid,
  SEED_GRID_SIZE,
  SEED_MAX_PER_GENRE,
  type SeedCandidate,
} from "./seed";

function c(patch: Partial<SeedCandidate> & { id: number }): SeedCandidate {
  return {
    mediaType: "movie",
    title: `Titolo ${patch.id}`,
    posterPath: `/p${patch.id}.jpg`,
    genreIds: [28],
    fonte: "tendenza",
    rank: null,
    score: 70,
    ...patch,
  };
}

describe("pickSeedGrid", () => {
  it("non mette più di SEED_MAX_PER_GENRE titoli dello stesso genere", () => {
    const griglia = pickSeedGrid(
      Array.from({ length: 10 }, (_, i) => c({ id: i + 1, genreIds: [28] })),
      10,
    );
    expect(griglia).toHaveLength(SEED_MAX_PER_GENRE);
  });

  it("mescola film e serie invece di mettere prima tutti i film", () => {
    const film = Array.from({ length: 6 }, (_, i) =>
      c({ id: i + 1, genreIds: [i], mediaType: "movie" }),
    );
    const serie = Array.from({ length: 6 }, (_, i) =>
      c({ id: 100 + i, genreIds: [i], mediaType: "tv" }),
    );
    const griglia = pickSeedGrid([...film, ...serie], 6);
    const tipi = new Set(griglia.map((g) => g.mediaType));
    expect(tipi.size).toBe(2);
    expect(griglia.filter((g) => g.mediaType === "tv").length).toBeGreaterThanOrEqual(2);
  });

  it("scarta i titoli senza locandina", () => {
    const griglia = pickSeedGrid([
      c({ id: 1, posterPath: "" }),
      c({ id: 2, genreIds: [35] }),
    ]);
    expect(griglia.map((g) => g.id)).toEqual([2]);
  });

  it("non ripete lo stesso titolo arrivato da due fonti", () => {
    const griglia = pickSeedGrid([
      c({ id: 5, rank: 1 }),
      c({ id: 5, rank: null }),
      c({ id: 6, genreIds: [35] }),
    ]);
    expect(griglia.filter((g) => g.id === 5)).toHaveLength(1);
  });

  it("mette prima chi è in classifica, poi chi ha lo ZappScore più alto", () => {
    const griglia = pickSeedGrid(
      [
        c({ id: 1, score: 95, rank: null, genreIds: [1] }),
        c({ id: 2, score: 60, rank: 2, genreIds: [2] }),
        c({ id: 3, score: 80, rank: null, genreIds: [3] }),
      ],
      3,
    );
    expect(griglia[0].id).toBe(2);
    expect(griglia[1].id).toBe(1);
  });

  it("taglia alla dimensione chiesta", () => {
    const molti = Array.from({ length: 100 }, (_, i) => c({ id: i + 1, genreIds: [i] }));
    expect(pickSeedGrid(molti)).toHaveLength(SEED_GRID_SIZE);
  });

  it("con zero candidati torna una griglia vuota, non un errore", () => {
    expect(pickSeedGrid([])).toEqual([]);
  });
});

describe("parseSeedKey", () => {
  it("legge tipo e id", () => {
    expect(parseSeedKey("movie-603")).toEqual({ titleId: 603, mediaType: "movie" });
    expect(parseSeedKey("tv-1396")).toEqual({ titleId: 1396, mediaType: "tv" });
  });

  it("scarta qualunque cosa storta", () => {
    expect(parseSeedKey("persona-1")).toBeNull();
    expect(parseSeedKey("movie-")).toBeNull();
    expect(parseSeedKey("movie")).toBeNull();
    expect(parseSeedKey("movie-abc")).toBeNull();
  });
});

describe("ordine delle fonti", () => {
  it("i classici vengono prima delle classifiche e delle tendenze", () => {
    // Serve a capire un gusto: chi si iscrive riconosce "Il padrino", non l'uscita di
    // questa settimana (segnalato dall'utente il 2026-09-08).
    const griglia = pickSeedGrid(
      [
        c({ id: 1, fonte: "tendenza", genreIds: [1], score: 9.9 }),
        c({ id: 2, fonte: "classifica", genreIds: [2], rank: 1, score: 5 }),
        c({ id: 3, fonte: "classico", genreIds: [3], score: 8.5 }),
      ],
      3,
    );
    expect(griglia.map((g) => g.fonte)).toEqual(["classico", "classifica", "tendenza"]);
  });

  it("dentro la stessa fonte decide la posizione, poi il voto", () => {
    const griglia = pickSeedGrid(
      [
        c({ id: 1, fonte: "classico", genreIds: [1], score: 8 }),
        c({ id: 2, fonte: "classico", genreIds: [2], score: 9 }),
      ],
      2,
    );
    expect(griglia[0].id).toBe(2);
  });
});
