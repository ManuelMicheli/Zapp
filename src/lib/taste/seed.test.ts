import { describe, expect, it } from "vitest";
import {
  finestraFormativa,
  parseSeedKey,
  pickSeedGrid,
  pickSeedGridForAge,
  SEED_GRID_SIZE,
  SEED_MAX_PER_GENRE,
  type SeedCandidate,
} from "./seed";

function c(patch: Partial<SeedCandidate> & { id: number }): SeedCandidate {
  return {
    mediaType: "movie",
    title: `Titolo ${patch.id}`,
    posterPath: `/p${patch.id}.jpg`,
    genreIds: [28],
    fonte: "tendenza",
    rank: null,
    score: 70,
    year: null,
    ...patch,
  };
}

describe("pickSeedGrid", () => {
  it("non mette più di SEED_MAX_PER_GENRE titoli dello stesso genere", () => {
    const griglia = pickSeedGrid(
      Array.from({ length: 10 }, (_, i) => c({ id: i + 1, genreIds: [28] })),
      10,
    );
    expect(griglia).toHaveLength(SEED_MAX_PER_GENRE);
  });

  it("mescola film e serie invece di mettere prima tutti i film", () => {
    const film = Array.from({ length: 6 }, (_, i) =>
      c({ id: i + 1, genreIds: [i], mediaType: "movie" }),
    );
    const serie = Array.from({ length: 6 }, (_, i) =>
      c({ id: 100 + i, genreIds: [i], mediaType: "tv" }),
    );
    const griglia = pickSeedGrid([...film, ...serie], 6);
    const tipi = new Set(griglia.map((g) => g.mediaType));
    expect(tipi.size).toBe(2);
    expect(griglia.filter((g) => g.mediaType === "tv").length).toBeGreaterThanOrEqual(2);
  });

  it("scarta i titoli senza locandina", () => {
    const griglia = pickSeedGrid([
      c({ id: 1, posterPath: "" }),
      c({ id: 2, genreIds: [35] }),
    ]);
    expect(griglia.map((g) => g.id)).toEqual([2]);
  });

  it("non ripete lo stesso titolo arrivato da due fonti", () => {
    const griglia = pickSeedGrid([
      c({ id: 5, rank: 1 }),
      c({ id: 5, rank: null }),
      c({ id: 6, genreIds: [35] }),
    ]);
    expect(griglia.filter((g) => g.id === 5)).toHaveLength(1);
  });

  it("mette prima chi è in classifica, poi chi ha lo ZappScore più alto", () => {
    const griglia = pickSeedGrid(
      [
        c({ id: 1, score: 95, rank: null, genreIds: [1] }),
        c({ id: 2, score: 60, rank: 2, genreIds: [2] }),
        c({ id: 3, score: 80, rank: null, genreIds: [3] }),
      ],
      3,
    );
    expect(griglia[0].id).toBe(2);
    expect(griglia[1].id).toBe(1);
  });

  it("taglia alla dimensione chiesta", () => {
    const molti = Array.from({ length: 100 }, (_, i) => c({ id: i + 1, genreIds: [i] }));
    expect(pickSeedGrid(molti)).toHaveLength(SEED_GRID_SIZE);
  });

  it("con zero candidati torna una griglia vuota, non un errore", () => {
    expect(pickSeedGrid([])).toEqual([]);
  });
});

describe("parseSeedKey", () => {
  it("legge tipo e id", () => {
    expect(parseSeedKey("movie-603")).toEqual({ titleId: 603, mediaType: "movie" });
    expect(parseSeedKey("tv-1396")).toEqual({ titleId: 1396, mediaType: "tv" });
  });

  it("scarta qualunque cosa storta", () => {
    expect(parseSeedKey("persona-1")).toBeNull();
    expect(parseSeedKey("movie-")).toBeNull();
    expect(parseSeedKey("movie")).toBeNull();
    expect(parseSeedKey("movie-abc")).toBeNull();
  });
});

describe("ordine delle fonti", () => {
  it("i classici vengono prima delle classifiche e delle tendenze", () => {
    // Serve a capire un gusto: chi si iscrive riconosce "Il padrino", non l'uscita di
    // questa settimana (segnalato dall'utente il 2026-09-08).
    const griglia = pickSeedGrid(
      [
        c({ id: 1, fonte: "tendenza", genreIds: [1], score: 9.9 }),
        c({ id: 2, fonte: "classifica", genreIds: [2], rank: 1, score: 5 }),
        c({ id: 3, fonte: "classico", genreIds: [3], score: 8.5 }),
      ],
      3,
    );
    expect(griglia.map((g) => g.fonte)).toEqual(["classico", "classifica", "tendenza"]);
  });

  it("dentro la stessa fonte decide la posizione, poi il voto", () => {
    const griglia = pickSeedGrid(
      [
        c({ id: 1, fonte: "classico", genreIds: [1], score: 8 }),
        c({ id: 2, fonte: "classico", genreIds: [2], score: 9 }),
      ],
      2,
    );
    expect(griglia[0].id).toBe(2);
  });
});

describe("pickSeedGridForAge", () => {
  const ORA = 2026;

  it("la finestra formativa va dai 10 ai 25 anni, e non arriva fino a oggi", () => {
    expect(finestraFormativa(1990, ORA)).toEqual({ da: 2000, a: 2015 });
    // Un diciottenne: la finestra si ferma due anni prima di oggi, non al 2033. Le
    // uscite dell'ultimo momento non sono "la sua epoca", sono solo le più recenti.
    expect(finestraFormativa(2008, ORA)).toEqual({ da: 2018, a: ORA - 2 });
    // Il più giovane che Zapp accetta: la finestra resta valida, non si rovescia.
    const minima = finestraFormativa(ORA - 14, ORA);
    expect(minima.a).toBeGreaterThanOrEqual(minima.da);
  });

  it("senza anno di nascita si comporta come la griglia di sempre", () => {
    const candidati = [
      c({ id: 1, fonte: "classico", genreIds: [1] }),
      c({ id: 2, fonte: "tendenza", genreIds: [2] }),
    ];
    expect(pickSeedGridForAge(candidati, null, 10, ORA)).toEqual(
      pickSeedGrid(candidati, 10),
    );
  });

  it("mette in griglia i titoli usciti nei suoi anni formativi e lascia fuori i fuori-epoca", () => {
    // Nato nel 1990: finestra 2000-2015.
    const dentro = Array.from({ length: 4 }, (_, i) =>
      c({ id: 10 + i, genreIds: [i], year: 2005, fonte: "tendenza", score: 5 }),
    );
    const fuori = Array.from({ length: 4 }, (_, i) =>
      c({ id: 90 + i, genreIds: [i], year: 2026, fonte: "tendenza", score: 9 }),
    );
    const griglia = pickSeedGridForAge([...fuori, ...dentro], 1990, 4, ORA);
    expect(griglia.map((g) => g.id).sort()).toEqual([10, 11, 12, 13]);
  });

  it("i grandi classici ci sono sempre, anche quando l'epoca basterebbe a riempire", () => {
    const epoca = Array.from({ length: 20 }, (_, i) =>
      c({ id: 200 + i, genreIds: [i], year: 2005, fonte: "tendenza" }),
    );
    const classici = Array.from({ length: 20 }, (_, i) =>
      c({ id: 300 + i, genreIds: [50 + i], year: 1975, fonte: "classico" }),
    );
    const griglia = pickSeedGridForAge([...epoca, ...classici], 1990, 12, ORA);
    const quantiClassici = griglia.filter((g) => g.fonte === "classico").length;
    expect(quantiClassici).toBeGreaterThanOrEqual(3);
    // "principalmente coerenti per la sua età": l'epoca resta la maggioranza
    expect(griglia.filter((g) => g.fonte !== "classico").length).toBeGreaterThan(
      quantiClassici,
    );
  });

  it("non ripete lo stesso titolo fra un secchio e l'altro", () => {
    // Un classico uscito dentro la finestra potrebbe finire in due secchi.
    const griglia = pickSeedGridForAge(
      [
        c({ id: 7, fonte: "classico", year: 2005, genreIds: [1] }),
        c({ id: 8, fonte: "tendenza", year: 2005, genreIds: [2] }),
      ],
      1990,
      10,
      ORA,
    );
    expect(griglia.filter((g) => g.id === 7)).toHaveLength(1);
  });

  it("con tutti gli anni di uscita mancanti riempie lo stesso la griglia", () => {
    const candidati = Array.from({ length: 6 }, (_, i) =>
      c({ id: i + 1, genreIds: [i], year: null }),
    );
    expect(pickSeedGridForAge(candidati, 1990, 6, ORA)).toHaveLength(6);
  });

  it("continua a mescolare film e serie", () => {
    const film = Array.from({ length: 6 }, (_, i) =>
      c({ id: i + 1, genreIds: [i], mediaType: "movie", year: 2005 }),
    );
    const serie = Array.from({ length: 6 }, (_, i) =>
      c({ id: 100 + i, genreIds: [i], mediaType: "tv", year: 2005 }),
    );
    const griglia = pickSeedGridForAge([...film, ...serie], 1990, 6, ORA);
    expect(griglia.filter((g) => g.mediaType === "tv").length).toBeGreaterThanOrEqual(2);
  });
});
