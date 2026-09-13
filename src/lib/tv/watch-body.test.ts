import { describe, expect, it } from "vitest";
import { parseWatchBody, toWatchResult } from "./watch-body";

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

describe("toWatchResult", () => {
  it("passa da snake_case a camelCase e normalizza l'errore assente", () => {
    expect(
      toWatchResult({
        ok: true,
        prev: null,
        entry: {
          status: "watching",
          rating: null,
          season_number: 1,
          episode_number: 3,
          is_private: false,
          started_at: "2026-09-01T00:00:00.000Z",
          finished_at: null,
          last_watched_at: "2026-09-13T00:00:00.000Z",
        },
      }),
    ).toEqual({
      ok: true,
      error: null,
      prev: null,
      entry: {
        status: "watching",
        rating: null,
        seasonNumber: 1,
        episodeNumber: 3,
        isPrivate: false,
        startedAt: "2026-09-01T00:00:00.000Z",
        finishedAt: null,
        lastWatchedAt: "2026-09-13T00:00:00.000Z",
      },
    });
  });

  it("entry senza last_watched_at: null, non undefined", () => {
    const risultato = toWatchResult({
      ok: false,
      error: "Richiesta non valida",
      prev: {
        status: "want",
        rating: null,
        season_number: null,
        episode_number: null,
        is_private: false,
        started_at: null,
        finished_at: null,
      },
      entry: null,
    });
    expect(risultato.error).toBe("Richiesta non valida");
    expect(risultato.prev?.lastWatchedAt).toBeNull();
    expect(risultato.entry).toBeNull();
  });
});
