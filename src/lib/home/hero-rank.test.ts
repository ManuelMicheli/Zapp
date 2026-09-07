import { describe, expect, it } from "vitest";
import {
  buildHeroList,
  genreIdsFor,
  mixHero,
  topGenreIds,
  type HeroItem,
} from "./hero-rank";

function item(id: number, mediaType: "movie" | "tv" = "movie"): Omit<HeroItem, "reason"> {
  return {
    id,
    mediaType,
    title: `T${id}`,
    posterPath: `/p${id}.jpg`,
    backdropPath: null,
    overview: null,
    year: "2026",
    genreIds: [],
    voteAverage: null,
  };
}

describe("buildHeroList", () => {
  it("alterna le sorgenti a rotazione e marca il motivo", () => {
    const out = buildHeroList(
      [
        { reason: "new", items: [item(1), item(2)] },
        { reason: "for_you", items: [item(3), item(4)] },
        { reason: "trending", items: [item(5)] },
      ],
      new Set(),
    );
    expect(out.map((i) => i.id)).toEqual([1, 3, 5, 2, 4]);
    expect(out.map((i) => i.reason)).toEqual([
      "new",
      "for_you",
      "trending",
      "new",
      "for_you",
    ]);
  });

  it("scarta doppioni e titoli già in libreria, senza lasciare buchi", () => {
    const out = buildHeroList(
      [
        { reason: "new", items: [item(1), item(2), item(3)] },
        { reason: "trending", items: [item(1), item(2), item(9)] },
      ],
      new Set(["movie-2"]),
    );
    expect(out.map((i) => i.id)).toEqual([1, 9, 3]);
  });

  it("distingue film e serie con lo stesso id e rispetta il tetto", () => {
    const out = buildHeroList(
      [{ reason: "new", items: [item(1, "movie"), item(1, "tv"), item(2), item(3)] }],
      new Set(),
      3,
    );
    expect(out.map((i) => `${i.mediaType}-${i.id}`)).toEqual([
      "movie-1",
      "tv-1",
      "movie-2",
    ]);
  });

  it("sorgenti vuote → lista vuota", () => {
    expect(buildHeroList([{ reason: "new", items: [] }], new Set())).toEqual([]);
  });
});

describe("topGenreIds", () => {
  it("conta gli id dei generi e prende i più frequenti", () => {
    const out = topGenreIds([
      [
        { id: 28, name: "Azione" },
        { id: 18, name: "Dramma" },
      ],
      [{ id: 18, name: "Dramma" }],
      [{ id: 35, name: "Commedia" }, { id: 18 }],
      null,
      [{ name: "Senza id" }],
    ]);
    expect(out).toEqual([18, 28]);
  });

  it("nessun genere → lista vuota", () => {
    expect(topGenreIds([])).toEqual([]);
  });
});

describe("genreIdsFor", () => {
  it("traduce i generi di film in quelli delle serie e viceversa, senza doppioni", () => {
    expect(genreIdsFor("tv", [28, 12, 18])).toEqual([10759, 18]);
    expect(genreIdsFor("movie", [10765, 35])).toEqual([878, 35]);
  });
});

describe("mixHero", () => {
  const hero = (id: number, mediaType: "movie" | "tv"): HeroItem => ({
    ...item(id, mediaType),
    reason: "new",
  });

  it("alterna film e serie, uno per uno", () => {
    const out = mixHero(
      [hero(1, "movie"), hero(2, "movie")],
      [hero(3, "tv"), hero(4, "tv")],
    );
    expect(out.map((i) => i.id)).toEqual([1, 3, 2, 4]);
  });

  it("una lista finita non lascia buchi", () => {
    const out = mixHero([hero(1, "movie")], [hero(2, "tv"), hero(3, "tv")]);
    expect(out.map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("si ferma a size", () => {
    const movie = [hero(1, "movie"), hero(2, "movie"), hero(3, "movie")];
    const tv = [hero(4, "tv"), hero(5, "tv")];
    expect(mixHero(movie, tv, 3).map((i) => i.id)).toEqual([1, 4, 2]);
  });
});
