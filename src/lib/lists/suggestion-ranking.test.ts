import { describe, expect, it } from "vitest";
import type { RankCandidate } from "@/lib/rank/types";
import type { TasteVector } from "@/lib/rank/vector";
import { rankEligibleSuggestions } from "./suggestion-ranking";

const vector: TasteVector = {
  generi: new Map([["18", 1]]),
  decenni: new Map(),
  provider: new Map(),
  persone: new Map(),
  tipo: new Map(),
  runtime: new Map(),
  lingua: new Map(),
  fiducia: 1,
  abbastanza: true,
};

function candidate(id: number, genreIds: number[], zappScore: number): RankCandidate {
  return {
    id,
    mediaType: id % 2 ? "movie" : "tv",
    title: `Titolo ${id}`,
    posterPath: `/p${id}.jpg`,
    backdropPath: null,
    overview: null,
    year: "2024",
    genreIds,
    runtime: null,
    originalLanguage: null,
    providerIds: [],
    inChart: null,
    freschezza: 1,
    people: [],
    zappScore,
    voteAverage: null,
    voteCount: null,
    friends: null,
  };
}

describe("rankEligibleSuggestions", () => {
  it("filtra prima della diversita e ordina insieme film e serie", () => {
    const candidates = [
      candidate(1, [18], 9),
      candidate(2, [35], 8),
      candidate(3, [18], 7),
    ];
    const allowed = new Set(["tv-2", "movie-3"]);

    const result = rankEligibleSuggestions(candidates, vector, allowed, 48);

    expect(result.map((item) => item.id)).toEqual([3, 2]);
  });

  it("usa mediaType e id come spareggio stabile", () => {
    const candidates = [candidate(4, [], 8), candidate(1, [], 8), candidate(2, [], 8)];
    const allowed = new Set(candidates.map((item) => `${item.mediaType}-${item.id}`));

    const result = rankEligibleSuggestions(candidates, vector, allowed, 48);

    expect(result.map((item) => `${item.mediaType}-${item.id}`)).toEqual([
      "movie-1",
      "tv-2",
      "tv-4",
    ]);
  });
});
