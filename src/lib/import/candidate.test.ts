import { describe, expect, it } from "vitest";
import { mergeProposals, type ImportProposal } from "./candidate";

describe("mergeProposals", () => {
  const base = {
    kind: "movie" as const,
    season: null,
    episode: null,
    lastDate: null,
    rowCount: 1,
    altTitle: null,
    fallbackShow: null,
    episodeTitles: [],
    matchedTitle: "X",
    posterPath: null,
    year: null,
    exact: true,
    viaFallback: false,
  };
  const p = (over: Partial<ImportProposal>): ImportProposal => ({
    key: over.netflixTitle ?? "k",
    netflixTitle: "t",
    tmdbId: 1,
    ...base,
    ...over,
  });

  it("due film sullo stesso id TMDB diventano uno", () => {
    const out = mergeProposals([
      p({ key: "a", netflixTitle: "Sonic", lastDate: "2023-01-01" }),
      p({
        key: "b",
        netflixTitle: "Sonic - Il film",
        lastDate: "2023-02-01",
        exact: false,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      key: "a",
      lastDate: "2023-02-01",
      rowCount: 2,
      exact: false,
    });
  });

  it("episodi riconosciuti a ripiego si sommano nella stessa serie", () => {
    const out = mergeProposals([
      p({ key: "a", kind: "tv", season: 1, episode: 1, viaFallback: true }),
      p({ key: "b", kind: "tv", season: 1, episode: 1, viaFallback: true }),
      p({ key: "c", kind: "tv", season: 1, episode: 1, viaFallback: true }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ season: 1, episode: 3, rowCount: 3 });
  });

  it("serie con stagioni + episodi a ripiego: resta il progresso della serie", () => {
    const out = mergeProposals([
      p({ key: "a", kind: "tv", season: 1, episode: 1, viaFallback: true }),
      p({ key: "b", kind: "tv", season: 2, episode: 4 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "a", season: 2, episode: 4, rowCount: 2 });
  });

  it("'visto' batte 'da vedere' e resta il voto piu' alto", () => {
    // succede con un JSON generico dove una voce porta il `tmdb_id` e l'altra no:
    // finiscono sullo stesso titolo, e i `giaNoti` sono in testa alla lista
    const out = mergeProposals([
      p({ key: "a", status: "want", rating: null }),
      p({ key: "b", status: "watched", rating: 8, lastDate: "2024-02-01" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      status: "watched",
      rating: 8,
      lastDate: "2024-02-01",
    });
  });

  it("due righe 'da vedere' restano da vedere", () => {
    const out = mergeProposals([
      p({ key: "a", status: "want" }),
      p({ key: "b", status: "want" }),
    ]);
    expect(out[0].status).toBe("want");
  });

  it("non riconosciuti e tipi diversi restano separati", () => {
    const out = mergeProposals([
      p({ key: "a", tmdbId: null, matchedTitle: null }),
      p({ key: "b", tmdbId: null, matchedTitle: null }),
      p({ key: "c", kind: "tv", tmdbId: 1, season: 1, episode: 1 }),
      p({ key: "d", kind: "movie", tmdbId: 1 }),
    ]);
    expect(out.map((x) => x.key)).toEqual(["a", "b", "c", "d"]);
  });
});
