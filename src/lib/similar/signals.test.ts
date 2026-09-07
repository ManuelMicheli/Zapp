import { describe, expect, it } from "vitest";
import { hasReadableLineage, seedProfile, yearOf } from "./signals";

const dune = {
  id: 693134,
  title: "Dune - Parte due",
  release_date: "2024-02-27",
  genres: [
    { id: 878, name: "Fantascienza" },
    { id: 12, name: "Avventura" },
  ],
  belongs_to_collection: { id: 726871, name: "Dune (collezione)" },
  keywords: {
    keywords: [
      { id: 1, name: "Desert" },
      { id: 2, name: "sequel" },
      { id: 3, name: "chosen one" },
      { id: 1, name: "desert" },
    ],
  },
  credits: {
    cast: [
      { id: 10, name: "Timothée Chalamet", order: 0 },
      { id: 11, name: "Zendaya", order: 1 },
    ],
    crew: [
      { id: 20, name: "Denis Villeneuve", job: "Director" },
      { id: 21, name: "Jon Spaihts", job: "Screenplay" },
      { id: 22, name: "Greig Fraser", job: "Director of Photography" },
    ],
  },
};

describe("seedProfile", () => {
  it("tiene le keyword vere, butta il rumore di produzione e i doppioni", () => {
    const seed = seedProfile(dune, "movie")!;
    expect(seed.keywords).toEqual([
      { id: 1, name: "desert" },
      { id: 3, name: "chosen one" },
    ]);
  });

  it("legge saga, regista, sceneggiatore, cast, generi e anno", () => {
    const seed = seedProfile(dune, "movie")!;
    expect(seed.collectionId).toBe(726871);
    expect(seed.directors).toEqual([{ id: 20, name: "Denis Villeneuve" }]);
    expect(seed.writers).toEqual([{ id: 21, name: "Jon Spaihts" }]);
    expect(seed.cast.map((p) => p.id)).toEqual([10, 11]);
    expect(seed.genreIds).toEqual([878, 12]);
    expect(seed.year).toBe(2024);
  });

  it("di una serie l'autore è chi l'ha creata, e l'anno è la prima messa in onda", () => {
    const seed = seedProfile(
      {
        id: 70523,
        name: "Dark",
        first_air_date: "2017-12-01",
        genres: [],
        created_by: [{ id: 5, name: "Baran bo Odar" }],
        keywords: { results: [{ id: 9, name: "time loop" }] },
      },
      "tv",
    )!;
    expect(seed.directors).toEqual([{ id: 5, name: "Baran bo Odar" }]);
    expect(seed.year).toBe(2017);
    expect(seed.keywords).toEqual([{ id: 9, name: "time loop" }]);
  });

  it("senza id non c'è identikit: chi chiama deve ripiegare", () => {
    expect(seedProfile({ title: "x" }, "movie")).toBeNull();
    expect(seedProfile(null, "movie")).toBeNull();
  });

  it("un dettaglio senza keyword né credits non esplode", () => {
    const seed = seedProfile({ id: 1, genres: [] }, "movie")!;
    expect(seed.keywords).toEqual([]);
    expect(seed.cast).toEqual([]);
    expect(seed.year).toBeNull();
  });
});

describe("hasReadableLineage", () => {
  it("due keyword vere bastano", () => {
    expect(hasReadableLineage(seedProfile(dune, "movie"))).toBe(true);
  });

  it("una sola keyword ma una saga basta lo stesso", () => {
    const seed = seedProfile(
      { id: 1, genres: [], belongs_to_collection: { id: 9 }, keywords: { keywords: [] } },
      "movie",
    );
    expect(hasReadableLineage(seed)).toBe(true);
  });

  it("un titolo senza niente non merita una pillola in home", () => {
    const seed = seedProfile({ id: 1, genres: [] }, "movie");
    expect(hasReadableLineage(seed)).toBe(false);
    expect(hasReadableLineage(null)).toBe(false);
  });
});

describe("yearOf", () => {
  it("prende l'anno da una data TMDB e rifiuta il resto", () => {
    expect(yearOf("2024-02-27")).toBe(2024);
    expect(yearOf("")).toBeNull();
    expect(yearOf(null)).toBeNull();
    expect(yearOf("0000-01-01")).toBeNull();
  });
});
