import { describe, expect, it } from "vitest";
import { CHICCHE } from "./data";
import { chiccaFor, chiccaKey, splitAroundQuote } from "./find";

describe("chiccaFor", () => {
  it("trova la chicca del titolo citato", () => {
    const chicca = chiccaFor("movie", 85); // I predatori dell'arca perduta
    expect(chicca?.speaker.name).toBe("Amy Farrah Fowler");
    expect(chicca?.source.tmdbId).toBe(1418);
  });

  it("torna null su un titolo senza chicche", () => {
    expect(chiccaFor("movie", 999999)).toBeNull();
  });

  it("non confonde film e serie con lo stesso id", () => {
    // 85 è un film nell'elenco: come serie non deve esistere
    expect(chiccaFor("tv", 85)).toBeNull();
  });
});

describe("splitAroundQuote", () => {
  it("isola la battuta dentro la recensione", () => {
    expect(splitAroundQuote("prima X dopo", "X")).toEqual(["prima ", "X", " dopo"]);
  });

  it("regge la battuta a inizio e a fine testo", () => {
    expect(splitAroundQuote("X dopo", "X")).toEqual(["", "X", " dopo"]);
    expect(splitAroundQuote("prima X", "X")).toEqual(["prima ", "X", ""]);
  });

  it("torna null se la battuta non c'è", () => {
    expect(splitAroundQuote("nessuna battuta", "X")).toBeNull();
  });
});

describe("elenco delle chicche", () => {
  it("ha un solo record per titolo citato", () => {
    const keys = CHICCHE.map((c) => chiccaKey(c.target));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("non fa citare un titolo da se stesso", () => {
    for (const c of CHICCHE) {
      expect(chiccaKey(c.source)).not.toBe(chiccaKey(c.target));
    }
  });

  it("ogni recensione contiene la battuta vera, parola per parola", () => {
    for (const c of CHICCHE) {
      expect(
        splitAroundQuote(c.review, c.quote),
        `la recensione di ${c.speaker.name} non contiene la sua battuta`,
      ).not.toBeNull();
    }
  });

  it("ha voto da 1 a 10 e tutti i campi pieni", () => {
    for (const c of CHICCHE) {
      expect(c.rating).toBeGreaterThanOrEqual(1);
      expect(c.rating).toBeLessThanOrEqual(10);
      expect(Number.isInteger(c.rating)).toBe(true);
      expect(c.quote.trim().length).toBeGreaterThan(0);
      expect(c.review.trim().length).toBeGreaterThan(c.quote.trim().length);
      expect(c.speaker.name.trim().length).toBeGreaterThan(0);
      expect(c.source.label.trim().length).toBeGreaterThan(0);
      expect(c.target.tmdbId).toBeGreaterThan(0);
      expect(c.source.tmdbId).toBeGreaterThan(0);
    }
  });
});
