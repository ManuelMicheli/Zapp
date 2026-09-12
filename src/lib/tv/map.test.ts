import { describe, expect, it } from "vitest";
import {
  annoDa,
  cardFromChart,
  cardFromRanked,
  cardFromShelf,
  cardFromSimilar,
} from "./map";

describe("annoDa", () => {
  it("accetta stringa, numero e data intera", () => {
    expect(annoDa("2019")).toBe("2019");
    expect(annoDa(2019)).toBe("2019");
    expect(annoDa("2019-05-01")).toBe("2019");
    expect(annoDa(null)).toBeNull();
    expect(annoDa("")).toBeNull();
  });
});

describe("cardFromShelf", () => {
  it("porta voto, affinita' e motivo quando ci sono", () => {
    const card = cardFromShelf({
      id: 1,
      mediaType: "movie",
      title: "Dune",
      posterPath: "/d.jpg",
      year: "2021",
      rating: 8.1,
      affinity: 87,
      reason: "Perché ami la fantascienza",
    });
    expect(card).toEqual({
      id: 1,
      mediaType: "movie",
      name: "Dune",
      year: "2021",
      posterPath: "/d.jpg",
      backdropPath: null,
      zappScore: 8.1,
      zappVotes: 0,
      affinity: 87,
      reason: "Perché ami la fantascienza",
      providerIds: [],
    });
  });
});

describe("cardFromRanked", () => {
  it("preferisce lo ZappScore al voto TMDB e porta le piattaforme", () => {
    const card = cardFromRanked({
      id: 2,
      mediaType: "tv",
      title: "Dark",
      posterPath: "/k.jpg",
      backdropPath: "/b.jpg",
      overview: null,
      year: "2017",
      genreIds: [],
      voteAverage: 8.4,
      zappScore: 9.0,
      runtime: null,
      originalLanguage: "de",
      providerIds: [8],
      punteggio: 0.9,
      percentuale: 91,
      contributi: [],
      motivo: "Di tendenza fra i tuoi amici",
    } as never);
    expect(card.zappScore).toBe(9.0);
    expect(card.affinity).toBe(91);
    expect(card.providerIds).toEqual([8]);
    expect(card.backdropPath).toBe("/b.jpg");
  });
});

describe("cardFromChart e cardFromSimilar", () => {
  it("classifica: voti e piattaforma", () => {
    const card = cardFromChart({
      id: 3,
      mediaType: "movie",
      title: "Oppenheimer",
      posterPath: null,
      year: "2023",
      rank: 1,
      momentum: null,
      providerId: 8,
      official: true,
      score: 8.7,
      votes: 12000,
    } as never);
    expect(card.zappVotes).toBe(12000);
    expect(card.providerIds).toEqual([8]);
  });
  it("simili: l'anno e' un numero e il motivo resta", () => {
    const card = cardFromSimilar({
      id: 4,
      mediaType: "movie",
      title: "Arrival",
      posterPath: "/a.jpg",
      year: 2016,
      score: 0.7,
      reason: "Di Denis Villeneuve",
      directorId: 1,
      keywordIds: [],
      genreIds: [],
    });
    expect(card.year).toBe("2016");
    expect(card.reason).toBe("Di Denis Villeneuve");
    expect(card.zappScore).toBeNull();
  });
});
