import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMdblistRatings } from "./parse";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
      "utf8",
    ),
  );
}

describe("parseMdblistRatings", () => {
  it("legge la risposta vera di un film (Dune: Parte due)", () => {
    expect(parseMdblistRatings(fixture("mdblist-single-movie.json"))).toEqual({
      imdb: { score: 84, votes: 790821 },
      metacritic: { score: 79, votes: 62 },
      trakt: { score: 86, votes: 49768 },
      tomatoes: { score: 92, votes: 466 },
      audience: { score: 95, votes: 2246 },
      tmdb: { score: 81, votes: 8493 },
      letterboxd: { score: 88, votes: 3610514 },
    });
  });

  it("legge ogni elemento della risposta vera in lotto", () => {
    const items = fixture("mdblist-batch-movies.json") as unknown[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const values = parseMdblistRatings(item);
      // ogni titolo del lotto porta almeno le quattro fonti sempre presenti
      expect(Object.keys(values).length).toBeGreaterThanOrEqual(4);
      for (const v of Object.values(values)) {
        expect(v.score).toBeGreaterThanOrEqual(0);
        expect(v.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("accetta anche il solo array di ratings", () => {
    expect(parseMdblistRatings([{ source: "tmdb", score: 81, votes: 11000 }])).toEqual({
      tmdb: { score: 81, votes: 11000 },
    });
  });

  it("riconosce il pubblico di Rotten Tomatoes sotto il nome `popcorn`", () => {
    const raw = { ratings: [{ source: "popcorn", value: 95, score: 95, votes: 2246 }] };
    expect(parseMdblistRatings(raw)).toEqual({ audience: { score: 95, votes: 2246 } });
  });

  it("ignora le fonti che non contiamo", () => {
    const raw = {
      ratings: [
        { source: "myanimelist", score: 89, votes: 400000 },
        { source: "metacriticuser", score: 83, votes: 1734 },
        { source: "rogerebert", value: 3.5, score: null, votes: null },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("non si lascia ingannare da `value`, che cambia scala fra gli endpoint", () => {
    // stessa fonte, stesso voto: 4,4/5 sul singolo titolo e 8,4/10 nel lotto
    const singolo = {
      ratings: [{ source: "letterboxd", value: 4.4, score: 88, votes: 10 }],
    };
    const lotto = {
      ratings: [{ source: "letterboxd", value: 8.8, score: 88, votes: 10 }],
    };
    expect(parseMdblistRatings(singolo)).toEqual(parseMdblistRatings(lotto));
  });

  it("scarta i punteggi fuori da 0-100", () => {
    const raw = {
      ratings: [
        { source: "imdb", score: 420, votes: 100 },
        { source: "tmdb", score: -1, votes: 100 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("mette 0 dove mancano i voti, senza perdere il punteggio", () => {
    expect(parseMdblistRatings({ ratings: [{ source: "tomatoes", score: 92 }] })).toEqual(
      {
        tomatoes: { score: 92, votes: 0 },
      },
    );
  });

  it("salta le fonti senza punteggio invece di inventarlo da `value`", () => {
    const raw = { ratings: [{ source: "imdb", value: 8.4, score: null, votes: 100 }] };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("a parità di fonte tiene quella con più voti", () => {
    const raw = {
      ratings: [
        { source: "imdb", score: 70, votes: 10 },
        { source: "imdb", score: 84, votes: 790821 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({ imdb: { score: 84, votes: 790821 } });
  });

  it("non esplode su forme inattese", () => {
    expect(parseMdblistRatings(null)).toEqual({});
    expect(parseMdblistRatings("boh")).toEqual({});
    expect(parseMdblistRatings({ ratings: "no" })).toEqual({});
    expect(parseMdblistRatings({ ratings: [null, 3, { source: 1 }] })).toEqual({});
  });
});
