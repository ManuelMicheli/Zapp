import { describe, expect, it } from "vitest";
import {
  annoDa,
  cardFromChart,
  cardFromEntry,
  cardFromLibrary,
  cardFromRanked,
  cardFromShelf,
  cardFromSimilar,
  continueFromItem,
  heroFromItem,
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

  it("senza ZappScore: null, mai il voto TMDB", () => {
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
      zappScore: null,
      runtime: null,
      originalLanguage: "de",
      providerIds: [8],
      punteggio: 0.9,
      percentuale: 91,
      contributi: [],
      motivo: null,
    } as never);
    expect(card.zappScore).toBeNull();
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

describe("cardFromLibrary", () => {
  it("porta titleId, stato e voto dell'utente (non lo ZappScore)", () => {
    const card = cardFromLibrary({
      titleId: 5,
      mediaType: "movie",
      status: "watched",
      rating: 9,
      name: "Parasite",
      posterPath: "/p.jpg",
      year: "2019",
      zappScore: 8.6,
      zappVotes: 4200,
    });
    expect(card).toEqual({
      id: 5,
      mediaType: "movie",
      name: "Parasite",
      year: "2019",
      posterPath: "/p.jpg",
      backdropPath: null,
      zappScore: 8.6,
      zappVotes: 4200,
      affinity: null,
      reason: null,
      providerIds: [],
      status: "watched",
      rating: 9,
    });
  });
});

describe("cardFromEntry", () => {
  it("legge il titolo agganciato e tiene solo le piattaforme flatrate", () => {
    const entry = {
      title_id: 6,
      media_type: "tv",
      title: {
        title: "Dark",
        release_date: "2017-12-01",
        poster_path: "/d.jpg",
        backdrop_path: "/d-back.jpg",
        title_providers: [
          { provider_id: 8, kind: "flatrate" },
          { provider_id: 68, kind: "rent" },
        ],
      },
    } as never;
    const card = cardFromEntry(entry);
    expect(card).toEqual({
      id: 6,
      mediaType: "tv",
      name: "Dark",
      year: "2017",
      posterPath: "/d.jpg",
      backdropPath: "/d-back.jpg",
      zappScore: null,
      zappVotes: 0,
      affinity: null,
      reason: null,
      providerIds: [8],
    });
  });
});

describe("continueFromItem", () => {
  const c = {
    entryId: "e1",
    titleId: 6,
    mediaType: "tv",
    name: "Dark",
    imageUrl: "/img.jpg",
    episodeLabel: "S2:E3",
    episodeName: "Ognuno è colpevole",
    runtimeLabel: "48 min",
    progressPct: 40,
    resumePositionMs: 600000,
    resumeDurationMs: 2880000,
    shownSeason: 2,
    shownEpisode: 3,
    providerId: 8,
  } as never;

  it("con entry: porta anche la tessera del titolo", () => {
    const entry = {
      title_id: 6,
      media_type: "tv",
      title: {
        title: "Dark",
        release_date: "2017-12-01",
        poster_path: "/d.jpg",
        backdrop_path: "/d-back.jpg",
        title_providers: [{ provider_id: 8, kind: "flatrate" }],
      },
    } as never;
    const card = continueFromItem(c, entry, true);
    expect(card.name).toBe("Dark");
    expect(card.posterPath).toBe("/d.jpg");
    expect(card.providerIds).toEqual([8]);
    expect(card.entryId).toBe("e1");
    expect(card.episodeLabel).toBe("S2:E3");
    expect(card.episodeName).toBe("Ognuno è colpevole");
    expect(card.shownSeason).toBe(2);
    expect(card.shownEpisode).toBe(3);
    expect(card.imageUrl).toBe("/img.jpg");
    expect(card.runtimeLabel).toBe("48 min");
    expect(card.progressPct).toBe(40);
    expect(card.resumePositionMs).toBe(600000);
    expect(card.resumeDurationMs).toBe(2880000);
    expect(card.providerId).toBe(8);
    expect(card.live).toBe(true);
  });

  it("senza entry: ripiega sul nome della tessera, senza copertina", () => {
    const card = continueFromItem(c, undefined, false);
    expect(card.name).toBe("Dark");
    expect(card.posterPath).toBeNull();
    expect(card.live).toBe(false);
  });
});

describe("heroFromItem", () => {
  const base = {
    id: 7,
    mediaType: "movie",
    title: "Oppenheimer",
    posterPath: "/o.jpg",
    backdropPath: "/o-back.jpg",
    overview: "Il fisico e la bomba",
    year: "2023",
    genreIds: [],
    voteAverage: 8.1,
  };

  it("personalizzata: il motivo del motore vince", () => {
    const card = heroFromItem({
      ...base,
      affinity: 91,
      motivo: "Di tendenza fra i tuoi amici",
      reason: "for_you",
    } as never);
    expect(card.reason).toBe("Di tendenza fra i tuoi amici");
    expect(card.overview).toBe("Il fisico e la bomba");
  });

  it("con affinita' ma senza motivo: 'Per te'", () => {
    const card = heroFromItem({
      ...base,
      affinity: 60,
      motivo: null,
      reason: "for_you",
    } as never);
    expect(card.reason).toBe("Per te");
  });

  it("di ripiego (senza affinita'): l'etichetta del motivo", () => {
    const card = heroFromItem({
      ...base,
      affinity: null,
      motivo: null,
      reason: "trending",
    } as never);
    expect(card.reason).toBe("Di tendenza");
  });

  it("mai un voto: il numero del motore hero e' mescolato, non lo ZappScore", () => {
    const card = heroFromItem({
      ...base,
      affinity: null,
      motivo: null,
      reason: "trending",
    } as never);
    expect(card.zappScore).toBeNull();
    expect(card.zappVotes).toBe(0);
  });
});
