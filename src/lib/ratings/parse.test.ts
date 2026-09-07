import { describe, expect, it } from "vitest";
import { parseMdblistRatings } from "./parse";

describe("parseMdblistRatings", () => {
  it("legge le fonti conosciute dalla risposta intera", () => {
    const raw = {
      id: 693134,
      title: "Dune: Part Two",
      ratings: [
        { source: "imdb", value: 8.5, score: 85, votes: 1200000 },
        { source: "metacritic", value: 79, score: 79, votes: 67 },
        { source: "letterboxd", value: 4.3, score: 86, votes: 890000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      imdb: { value: 8.5, votes: 1200000 },
      metacritic: { value: 79, votes: 67 },
      letterboxd: { value: 4.3, votes: 890000 },
    });
  });

  it("accetta anche il solo array di ratings", () => {
    const raw = [{ source: "tmdb", value: 8.2, votes: 11000 }];
    expect(parseMdblistRatings(raw)).toEqual({
      tmdb: { value: 8.2, votes: 11000 },
    });
  });

  it("traduce i nomi di Rotten Tomatoes nelle nostre due fonti", () => {
    const raw = {
      ratings: [
        { source: "tomatoes", value: 92, votes: 410 },
        { source: "tomatoesaudience", value: 95, votes: 250000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      tomatoes: { value: 92, votes: 410 },
      audience: { value: 95, votes: 250000 },
    });
  });

  it("ignora le fonti che non conosciamo", () => {
    const raw = {
      ratings: [{ source: "myanimelist", value: 8.9, votes: 400000 }],
    };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("scarta i valori fuori dalla scala della fonte", () => {
    const raw = {
      ratings: [
        { source: "imdb", value: 42, votes: 100 },
        { source: "letterboxd", value: -1, votes: 100 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({});
  });

  it("mette 0 dove mancano i voti, senza perdere il valore", () => {
    const raw = { ratings: [{ source: "rogerebert", value: 4 }] };
    expect(parseMdblistRatings(raw)).toEqual({
      rogerebert: { value: 4, votes: 0 },
    });
  });

  it("ricava il valore da `score` quando `value` è nullo", () => {
    // `score` di MDBList è normalizzato 0-100: su Letterboxd (0-5) 86 vale 4,3
    const raw = {
      ratings: [{ source: "letterboxd", value: null, score: 86, votes: 10 }],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      letterboxd: { value: 4.3, votes: 10 },
    });
  });

  it("a parità di fonte tiene quella con più voti", () => {
    const raw = {
      ratings: [
        { source: "imdb", value: 7, votes: 10 },
        { source: "imdb", value: 8.5, votes: 1200000 },
      ],
    };
    expect(parseMdblistRatings(raw)).toEqual({
      imdb: { value: 8.5, votes: 1200000 },
    });
  });

  it("non esplode su forme inattese", () => {
    expect(parseMdblistRatings(null)).toEqual({});
    expect(parseMdblistRatings("boh")).toEqual({});
    expect(parseMdblistRatings({ ratings: "no" })).toEqual({});
    expect(parseMdblistRatings({ ratings: [null, 3, { source: 1 }] })).toEqual({});
  });
});
