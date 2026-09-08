import { describe, expect, it } from "vitest";
import { MASSA_MINIMA, MASSA_PIENA, toTasteVector } from "@/lib/rank/vector";
import {
  GENRES,
  genreAffinity,
  genreByKey,
  genreByTmdbId,
  genresFor,
  orderGenres,
  recipeFor,
  TESTA_PERSONALE,
} from "./catalog";
import { genrePickKeys, genrePicks } from "./picks";
import type { Tables } from "@/types/database";

function riga(patch: Partial<Tables<"user_taste">> = {}): Tables<"user_taste"> {
  return {
    user_id: "u",
    generi: {},
    decenni: {},
    provider: {},
    persone: {},
    tipo: {},
    runtime: {},
    lingua: {},
    novita: 0,
    massa: MASSA_PIENA,
    eventi_contati: 0,
    updated_at: "2026-09-08T00:00:00Z",
    ...patch,
  } as Tables<"user_taste">;
}

describe("catalogo dei generi", () => {
  it("ha chiavi uniche, in minuscolo e senza spazi", () => {
    const chiavi = GENRES.map((e) => e.key);
    expect(new Set(chiavi).size).toBe(chiavi.length);
    for (const k of chiavi) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("scrive pillola, titolo e sottotitolo per ogni voce", () => {
    for (const e of GENRES) {
      expect(e.pillola.trim().length).toBeGreaterThan(0);
      expect(e.titolo.trim().length).toBeGreaterThan(0);
      // Il sottotitolo non ripete il nome: dice cosa c'è dentro.
      expect(e.sottotitolo.trim().length).toBeGreaterThan(10);
    }
  });

  it("usa id di generi interi e positivi", () => {
    for (const e of GENRES) {
      for (const id of [...e.movie.generi, ...(e.movie.senzaGeneri ?? [])]) {
        expect(Number.isInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
      }
    }
  });

  it("dichiara almeno una chiave di gusto per ogni voce", () => {
    // Senza chiavi la voce non potrebbe mai salire in testa alle pillole: sarebbe
    // curata per tutti e personale per nessuno.
    for (const e of GENRES) expect(e.chiavi.length).toBeGreaterThan(0);
  });

  it("dà a ogni voce una testa curata, e non ne ha di orfane", () => {
    for (const e of GENRES) expect(genrePicks(e.key).length).toBeGreaterThan(0);
    for (const k of genrePickKeys()) expect(genreByKey(k)).not.toBeNull();
  });

  it("non mette serie curate sotto una voce solo film", () => {
    for (const e of GENRES) {
      if (e.tv !== null) continue;
      expect(genrePicks(e.key).every((p) => p.mediaType === "movie")).toBe(true);
    }
  });

  it("i titoli curati hanno locandina e un id vero", () => {
    for (const e of GENRES) {
      for (const p of genrePicks(e.key)) {
        expect(Number.isInteger(p.id)).toBe(true);
        expect(p.posterPath.startsWith("/")).toBe(true);
      }
    }
  });
});

describe("genreByKey / genresFor / recipeFor", () => {
  it("non si fa ingannare da una chiave che arriva dall'URL", () => {
    expect(genreByKey("azione")?.pillola).toBe("Azione");
    expect(genreByKey("non-esiste")).toBeNull();
    expect(genreByKey(42)).toBeNull();
    expect(genreByKey(null)).toBeNull();
    expect(genreByKey(undefined)).toBeNull();
  });

  it("sotto Serie TV toglie le voci senza ricetta per le serie", () => {
    const serie = genresFor("tv");
    expect(serie.every((e) => e.tv !== null)).toBe(true);
    expect(genresFor("movie").length).toBeGreaterThanOrEqual(serie.length);
  });

  it("la ricetta delle serie parte da quella dei film e ne cambia i pezzi", () => {
    const thriller = genreByKey("thriller")!;
    expect(recipeFor(thriller, "movie")!.generi).toEqual([53]);
    // il tv override riscrive i generi ma tiene le esclusioni della base
    expect(recipeFor(thriller, "tv")!.generi).toEqual([9648, 80]);
    expect(recipeFor(thriller, "tv")!.senzaGeneri).toEqual(thriller.movie.senzaGeneri);
  });

  it("una voce solo film non ha ricetta per le serie", () => {
    const soloFilm = GENRES.filter((e) => e.tv === null);
    for (const e of soloFilm) expect(recipeFor(e, "tv")).toBeNull();
  });
});

describe("vecchi link per id TMDB", () => {
  it("traduce un id di genere nella voce che lo copre", () => {
    expect(genreByTmdbId(28)?.key).toBe("azione");
    expect(genreByTmdbId(27)?.key).toBe("horror");
    expect(genreByTmdbId(99)?.key).toBe("documentari");
  });

  it("torna null per un id sconosciuto o non intero", () => {
    expect(genreByTmdbId(999999)).toBeNull();
    expect(genreByTmdbId(Number("x"))).toBeNull();
  });
});

describe("orderGenres", () => {
  it("senza profilo tiene l'ordine del catalogo", () => {
    expect(orderGenres("movie", null).map((e) => e.key)).toEqual(
      GENRES.map((e) => e.key),
    );
    expect(orderGenres("movie", toTasteVector(null)).map((e) => e.key)).toEqual(
      GENRES.map((e) => e.key),
    );
  });

  it("con un profilo ancora povero non riordina niente", () => {
    const povero = toTasteVector(riga({ generi: { "27": 1 }, massa: MASSA_MINIMA - 1 }));
    expect(orderGenres("movie", povero)[0].key).toBe(GENRES[0].key);
  });

  it("porta in testa i generi che l'utente guarda di più", () => {
    const v = toTasteVector(riga({ generi: { "27": 1, "53": 0.6 } }));
    const ordine = orderGenres("movie", v).map((e) => e.key);
    expect(ordine[0]).toBe("horror");
    expect(ordine[1]).toBe("thriller");
  });

  it("riordina anche sulle dimensioni che non sono generi", () => {
    // "Anime" si misura sulla lingua, "Cult anni 80" sul decennio: sono voci curate
    // che nessun id di genere potrebbe far salire.
    const v = toTasteVector(riga({ lingua: { ja: 1 }, decenni: { "1980": 0.9 } }));
    const ordine = orderGenres("movie", v).map((e) => e.key);
    expect(ordine.slice(0, TESTA_PERSONALE)).toContain("anime");
    expect(ordine.slice(0, TESTA_PERSONALE)).toContain("cult-anni-80");
  });

  it("non perde né duplica nessuna voce", () => {
    const v = toTasteVector(riga({ generi: { "18": 1, "35": 0.8, "80": 0.5 } }));
    for (const type of ["movie", "tv"] as const) {
      const ordine = orderGenres(type, v);
      expect(ordine.length).toBe(genresFor(type).length);
      expect(new Set(ordine.map((e) => e.key)).size).toBe(ordine.length);
    }
  });

  it("sposta al massimo le prime voci, non tutta la fila", () => {
    const v = toTasteVector(
      riga({ generi: Object.fromEntries(GENRES.map((e, i) => [e.chiavi[0].chiave, i])) }),
    );
    const ordine = orderGenres("movie", v).map((e) => e.key);
    const coda = ordine.slice(TESTA_PERSONALE);
    const attesa = GENRES.map((e) => e.key).filter((k) => coda.includes(k));
    expect(coda).toEqual(attesa);
  });

  it("un genere che il profilo non conosce vale zero, mai meno", () => {
    const v = toTasteVector(riga({ generi: { "28": 1 } }));
    const documentari = genreByKey("documentari")!;
    expect(genreAffinity(v, documentari)).toBe(0);
  });
});
