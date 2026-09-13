import { describe, expect, it } from "vitest";
import { parseWatchBody } from "./watch-body";

describe("parseWatchBody", () => {
  it("azione semplice", () => {
    expect(
      parseWatchBody({ titleId: 27205, mediaType: "movie", action: "want" }),
    ).toEqual({
      titleId: 27205,
      mediaType: "movie",
      action: "want",
      season: null,
      episode: null,
      rating: null,
    });
  });
  it("episodio richiede stagione ed episodio su una serie", () => {
    // Accetta season 0 (specials) e episode
    expect(
      parseWatchBody({
        titleId: 1399,
        mediaType: "tv",
        action: "episode",
        season: 0,
        episode: 1,
      })?.season,
    ).toBe(0);
    // Accetta stagioni numerate per anno
    expect(
      parseWatchBody({
        titleId: 1399,
        mediaType: "tv",
        action: "episode",
        season: 2024,
        episode: 3,
      })?.season,
    ).toBe(2024);
    // Rifiuta season fuori range
    expect(
      parseWatchBody({
        titleId: 1399,
        mediaType: "tv",
        action: "episode",
        season: 3001,
        episode: 1,
      }),
    ).toBeNull();
    // Rifiuta senza stagione o episodio
    expect(
      parseWatchBody({ titleId: 1399, mediaType: "tv", action: "episode" }),
    ).toBeNull();
    // Rifiuta episodio su movie
    expect(
      parseWatchBody({
        titleId: 27205,
        mediaType: "movie",
        action: "episode",
        season: 1,
        episode: 1,
      }),
    ).toBeNull();
  });
  it("rate richiede un voto 1-10", () => {
    expect(
      parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate", rating: 8 })
        ?.rating,
    ).toBe(8);
    expect(
      parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate", rating: 11 }),
    ).toBeNull();
    expect(
      parseWatchBody({ titleId: 27205, mediaType: "movie", action: "rate" }),
    ).toBeNull();
  });
  it("rifiuta il resto", () => {
    expect(parseWatchBody(null)).toBeNull();
    expect(
      parseWatchBody({ titleId: -1, mediaType: "movie", action: "want" }),
    ).toBeNull();
    expect(parseWatchBody({ titleId: 1, mediaType: "book", action: "want" })).toBeNull();
    expect(
      parseWatchBody({ titleId: 1, mediaType: "movie", action: "explode" }),
    ).toBeNull();
  });
});
