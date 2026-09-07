import { describe, expect, it } from "vitest";
import {
  ageMultiplier,
  formMultiplier,
  keywordIdf,
  qualityMultiplier,
  rankCandidates,
  reasonFor,
} from "./score";
import type { Candidate, SeedProfile } from "./types";

const NOW = new Date("2026-09-07T12:00:00Z");

const seed: SeedProfile = {
  id: 1,
  mediaType: "movie",
  year: 2026,
  keywords: [
    { id: 10, name: "heist" },
    { id: 11, name: "revenge" },
  ],
  collectionId: 500,
  directors: [{ id: 20, name: "Denis Villeneuve" }],
  writers: [{ id: 21, name: "Jon Spaihts" }],
  cast: [{ id: 30, name: "Zendaya" }],
  genreIds: [28, 53],
};

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 2,
    mediaType: "movie",
    title: "Titolo",
    posterPath: "/p.jpg",
    year: 2025,
    voteAverage: 7,
    voteCount: 900,
    genreIds: [28],
    adult: false,
    releaseDate: "2025-01-01",
    keywordHits: [],
    fromCollection: false,
    director: null,
    writer: null,
    castHits: [],
    // Quasi ogni candidato arriva anche dalle liste di TMDB: è il secondo segnale
    // debole che la maggior parte dei titoli ha davvero.
    collabRank: 12,
    ...over,
  };
}

const hit = (id: number, name: string, strong = false) => ({
  id,
  name,
  idf: keywordIdf(400),
  strong,
});

const rank = (list: Candidate[]) => rankCandidates(seed, list, { now: NOW });

describe("keywordIdf", () => {
  it("una keyword rara pesa più di una generica", () => {
    expect(keywordIdf(300)).toBeGreaterThan(keywordIdf(30_000));
  });

  it("resta dentro limiti sensati anche agli estremi", () => {
    expect(keywordIdf(1)).toBeLessThanOrEqual(1);
    expect(keywordIdf(5_000_000)).toBeGreaterThanOrEqual(0.15);
  });
});

describe("qualityMultiplier", () => {
  it("va da 0,75 a 1,25 e vale 1 senza voto", () => {
    expect(qualityMultiplier(0)).toBeCloseTo(0.75);
    expect(qualityMultiplier(10)).toBeCloseTo(1.25);
    expect(qualityMultiplier(null)).toBe(1);
  });
});

describe("ageMultiplier", () => {
  it("cinque anni di distanza non costano niente", () => {
    expect(ageMultiplier(2026, 2022, NOW)).toBe(1);
  });

  it("per un seme recente il vecchio scende più in fretta del contrario", () => {
    const vecchioSottoSemeNuovo = ageMultiplier(2026, 1996, NOW);
    const nuovoSottoSemeVecchio = ageMultiplier(1996, 2026, NOW);
    expect(vecchioSottoSemeNuovo).toBeLessThan(nuovoSottoSemeVecchio);
  });

  it("non scende mai sotto la metà: il capostipite resta possibile", () => {
    expect(ageMultiplier(2026, 1930, NOW)).toBe(0.5);
  });
});

describe("rankCandidates", () => {
  it("il filone batte il genere", () => {
    const perFilone = cand({ id: 2, genreIds: [], keywordHits: [hit(10, "heist")] });
    const perGenere = cand({ id: 3, genreIds: [28, 53], collabRank: 0 });
    expect(rank([perGenere, perFilone])[0].id).toBe(2);
  });

  it("per un seme del 2026 il titolo recente batte quello di trent'anni fa a pari filone", () => {
    const vecchio = cand({ id: 2, year: 1995, keywordHits: [hit(10, "heist")] });
    const nuovo = cand({ id: 3, year: 2024, keywordHits: [hit(10, "heist")] });
    expect(rank([vecchio, nuovo])[0].id).toBe(3);
  });

  it("ma un filone fortissimo tiene dentro il capostipite", () => {
    const capostipite = cand({
      id: 2,
      year: 1979,
      keywordHits: [hit(10, "heist", true), hit(11, "revenge", true)],
      director: { id: 20, name: "Denis Villeneuve" },
    });
    const recenteDebole = cand({ id: 3, year: 2025, genreIds: [28, 53] });
    const out = rank([recenteDebole, capostipite]);
    expect(out[0].id).toBe(2);
  });

  it("scarta il seme stesso, chi non ha locandina, chi ha pochi voti, chi non è uscito", () => {
    const out = rank([
      cand({ id: 1, keywordHits: [hit(10, "heist")] }),
      cand({ id: 4, posterPath: null, keywordHits: [hit(10, "heist")] }),
      cand({ id: 5, voteCount: 3, keywordHits: [hit(10, "heist")] }),
      cand({ id: 6, releaseDate: "2027-01-01", keywordHits: [hit(10, "heist")] }),
      cand({ id: 7, adult: true, keywordHits: [hit(10, "heist")] }),
      cand({ id: 8, keywordHits: [hit(10, "heist")] }),
    ]);
    expect(out.map((i) => i.id)).toEqual([8]);
  });

  it("un titolo che condivide solo un genere su tanti resta fuori", () => {
    expect(rank([cand({ id: 9, genreIds: [28, 12, 16, 35] })])).toEqual([]);
  });

  it("i legami solidi passano davanti, anche a punteggio più basso", () => {
    const unSegnaleForte = cand({
      id: 2,
      collabRank: null,
      keywordHits: [{ id: 10, name: "heist", idf: 1, strong: false }],
    });
    const dueSegnaliDeboli = cand({
      id: 3,
      collabRank: 18,
      keywordHits: [{ id: 11, name: "revenge", idf: 0.2, strong: false }],
    });
    const out = rank([unSegnaleForte, dueSegnaliDeboli]);
    expect(out.map((i) => i.id)).toEqual([3, 2]);
    expect(out[1].score).toBeGreaterThan(out[0].score);
  });

  it("chi ha un solo segnale riempie comunque lo scaffale: non si ampùta", () => {
    const soloUnaKeyword = cand({
      id: 2,
      keywordHits: [hit(10, "heist")],
      collabRank: null,
    });
    expect(rank([soloUnaKeyword]).map((i) => i.id)).toEqual([2]);
  });

  it("al massimo due titoli della stessa saga e dello stesso regista", () => {
    const saga = [2, 3, 4].map((id) =>
      cand({ id, fromCollection: true, keywordHits: [hit(10, "heist")] }),
    );
    const regista = [5, 6, 7].map((id) =>
      cand({
        id,
        director: { id: 20, name: "Denis Villeneuve" },
        keywordHits: [hit(10, "heist")],
      }),
    );
    const out = rank([...saga, ...regista]);
    expect(out.filter((i) => [2, 3, 4].includes(i.id))).toHaveLength(2);
    expect(out.filter((i) => [5, 6, 7].includes(i.id))).toHaveLength(2);
  });

  it("l'ordine è deterministico a pari punteggio", () => {
    const a = cand({ id: 9, keywordHits: [hit(10, "heist")] });
    const b = cand({ id: 3, keywordHits: [hit(10, "heist")] });
    expect(rank([a, b]).map((i) => i.id)).toEqual([3, 9]);
    expect(rank([b, a]).map((i) => i.id)).toEqual([3, 9]);
  });

  it("lo ZappScore rompe i pareggi ma non ribalta il filone", () => {
    const ratings = new Map([
      ["movie-2", 9.5],
      ["movie-3", 4],
    ]);
    const buono = cand({ id: 2, keywordHits: [hit(10, "heist")] });
    const brutto = cand({ id: 3, keywordHits: [hit(10, "heist")] });
    const out = rankCandidates(seed, [brutto, buono], { ratings, now: NOW });
    expect(out[0].id).toBe(2);

    const bruttoMaInTema = cand({ id: 3, keywordHits: [hit(10, "heist", true)] });
    const buonoFuoriTema = cand({ id: 2, genreIds: [28, 53] });
    const out2 = rankCandidates(seed, [buonoFuoriTema, bruttoMaInTema], {
      ratings,
      now: NOW,
    });
    expect(out2[0].id).toBe(3);
  });

  it("taglia alla misura chiesta", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      cand({ id: i + 2, keywordHits: [hit(10, "heist")] }),
    );
    expect(rankCandidates(seed, many, { size: 4, now: NOW })).toHaveLength(4);
  });
});

describe("formMultiplier", () => {
  it("un cartone sotto un film dal vero (e viceversa) scende", () => {
    expect(formMultiplier([28, 53], [16, 28])).toBeLessThan(1);
    expect(formMultiplier([16, 35], [35])).toBeLessThan(1);
  });

  it("stessa forma, nessuna penalità", () => {
    expect(formMultiplier([16, 35], [16, 12])).toBe(1);
    expect(formMultiplier([28, 53], [28])).toBe(1);
  });

  it("un documentario non si mescola con la finzione", () => {
    expect(formMultiplier([18], [99, 18])).toBeLessThan(1);
  });
});

describe("reasonFor", () => {
  it("dice la cosa più forte, in italiano", () => {
    expect(reasonFor(seed, cand({ fromCollection: true }))).toBe("Stessa saga");
    expect(
      reasonFor(seed, cand({ director: { id: 20, name: "Denis Villeneuve" } })),
    ).toBe("Di Denis Villeneuve");
    expect(reasonFor(seed, cand({ keywordHits: [hit(10, "heist")] }))).toBe("Rapina");
    expect(reasonFor(seed, cand({ castHits: [{ id: 30, name: "Zendaya" }] }))).toBe(
      "Con Zendaya",
    );
  });

  it("una keyword che non sappiamo tradurre non diventa un motivo in inglese", () => {
    expect(
      reasonFor(seed, cand({ keywordHits: [hit(99, "duringcreditsstinger")] })),
    ).toBe(null);
  });

  it("due temi si scrivono uniti dal punto", () => {
    expect(
      reasonFor(seed, cand({ keywordHits: [hit(10, "heist"), hit(11, "revenge")] })),
    ).toMatch(/·/);
  });
});
