import { describe, expect, it } from "vitest";
import {
  buildTasteProfile,
  decadeOf,
  metaKey,
  runtimeBucket,
  type TasteInput,
  type TitleMeta,
} from "./profile";
import type { TasteRow } from "./weights";

const ORA = new Date("2026-09-07T12:00:00Z");

function riga(patch: Partial<TasteRow> & { titleId: number }): TasteRow {
  return {
    mediaType: "movie",
    status: null,
    rating: null,
    lastWatchedAt: ORA.toISOString(),
    isSeed: false,
    impressionSessions: 0,
    opens: 0,
    providerOpens: 0,
    trailers: 0,
    dismisses: 0,
    lastEventAt: null,
    ...patch,
  };
}

function meta(patch: Partial<TitleMeta> = {}): TitleMeta {
  return {
    mediaType: "movie",
    genreIds: [28],
    year: 2020,
    runtime: 120,
    providerIds: [8],
    people: [],
    originalLanguage: "en",
    ...patch,
  };
}

function input(rows: TasteRow[], metas: [string, TitleMeta][]): TasteInput {
  return { birthYear: null, rows, meta: new Map(metas), now: ORA };
}

describe("runtimeBucket / decadeOf", () => {
  it("divide le durate in tre fasce", () => {
    expect(runtimeBucket(70)).toBe("corto");
    expect(runtimeBucket(110)).toBe("medio");
    expect(runtimeBucket(160)).toBe("lungo");
    expect(runtimeBucket(null)).toBeNull();
    expect(runtimeBucket(0)).toBeNull();
  });

  it("arrotonda l'anno al decennio", () => {
    expect(decadeOf(1997)).toBe("1990");
    expect(decadeOf(2026)).toBe("2020");
    expect(decadeOf(null)).toBeNull();
  });
});

describe("buildTasteProfile", () => {
  it("le quote positive di una dimensione sommano a 1", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched", rating: 9 }),
          riga({ titleId: 2, status: "watched" }),
        ],
        [
          [metaKey("movie", 1), meta({ genreIds: [28] })],
          [metaKey("movie", 2), meta({ genreIds: [35] })],
        ],
      ),
    );
    const somma = Object.values(p.generi).reduce((a, b) => a + b, 0);
    expect(somma).toBeCloseTo(1, 3);
    expect(p.generi["28"]).toBeGreaterThan(p.generi["35"]);
  });

  it("un titolo rifiutato lascia il suo genere in negativo", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched", rating: 9 }),
          riga({ titleId: 2, dismisses: 1 }),
        ],
        [
          [metaKey("movie", 1), meta({ genreIds: [28] })],
          [metaKey("movie", 2), meta({ genreIds: [27] })],
        ],
      ),
    );
    expect(p.generi["28"]).toBeCloseTo(1, 3);
    expect(p.generi["27"]).toBeLessThan(0);
  });

  it("la massa è la somma dei pesi positivi, non il numero di titoli", () => {
    const p = buildTasteProfile(
      input(
        [riga({ titleId: 1, status: "watched", rating: 9 })],
        [[metaKey("movie", 1), meta()]],
      ),
    );
    expect(p.massa).toBeCloseTo(16, 2);
  });

  it("un titolo senza metadati non entra nelle dimensioni ma conta nella massa", () => {
    const p = buildTasteProfile(input([riga({ titleId: 99, status: "watched" })], []));
    expect(p.massa).toBeCloseTo(6, 2);
    expect(p.generi).toEqual({});
  });

  it("novita è la quota di peso sui titoli usciti negli ultimi due anni", () => {
    const p = buildTasteProfile(
      input(
        [
          riga({ titleId: 1, status: "watched" }),
          riga({ titleId: 2, status: "watched" }),
        ],
        [
          [metaKey("movie", 1), meta({ year: 2026 })],
          [metaKey("movie", 2), meta({ year: 1999 })],
        ],
      ),
    );
    expect(p.novita).toBeCloseTo(0.5, 3);
  });

  it("l'anno di nascita inclina i decenni dell'adolescenza, senza ribaltarli", () => {
    const righe = () => [riga({ titleId: 1, status: "watched", rating: 9 })];
    const metas = (): [string, TitleMeta][] => [
      [metaKey("movie", 1), meta({ year: 2020 })],
    ];
    const senza = buildTasteProfile(input(righe(), metas()));
    const con = buildTasteProfile({ ...input(righe(), metas()), birthYear: 1990 });

    expect(con.decenni["2000"] ?? 0).toBeGreaterThan(senza.decenni["2000"] ?? 0);
    const massimo = Object.entries(con.decenni).sort((a, b) => b[1] - a[1])[0];
    expect(massimo[0]).toBe("2020");
  });

  it("conta gli eventi visti, non i titoli", () => {
    const p = buildTasteProfile(
      input(
        [riga({ titleId: 1, impressionSessions: 3, opens: 2, dismisses: 1 })],
        [[metaKey("movie", 1), meta()]],
      ),
    );
    expect(p.eventiContati).toBe(6);
  });

  it("un profilo vuoto è un profilo vuoto, non un errore", () => {
    const p = buildTasteProfile(input([], []));
    expect(p.massa).toBe(0);
    expect(p.novita).toBe(0);
    expect(p.generi).toEqual({});
  });
});
