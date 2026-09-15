import { describe, expect, it } from "vitest";
import { GENRES, genreByKey } from "@/lib/genres/catalog";
import { PLATFORMS } from "@/lib/platforms/catalog";
import {
  HOME_SCOPE_VUOTO,
  inGenre,
  parseScope,
  passaGenere,
  scopeCanonico,
  scopePath,
  scopeTitle,
  scopeVuoto,
} from "./scope";

const azione = genreByKey("azione")!;
const netflix = PLATFORMS.find((p) => p.key === "netflix")!;
const prime = PLATFORMS.find((p) => p.key === "prime-video")!;

describe("parseScope", () => {
  it("legge un genere, una o più piattaforme, in qualunque ordine", () => {
    expect(parseScope(["azione"])).toEqual({ genre: azione, platforms: [] });
    expect(parseScope(["netflix"])).toEqual({ genre: null, platforms: [netflix] });
    expect(parseScope(["azione", "netflix"])).toEqual({
      genre: azione,
      platforms: [netflix],
    });
    expect(parseScope(["netflix", "azione"])).toEqual({
      genre: azione,
      platforms: [netflix],
    });
    expect(parseScope(["netflix", "prime-video"])).toEqual({
      genre: null,
      platforms: [netflix, prime],
    });
    expect(parseScope(["azione", "netflix", "prime-video"])).toEqual({
      genre: azione,
      platforms: [netflix, prime],
    });
  });

  it("rifiuta chiavi ignote, doppioni e generi doppi", () => {
    expect(parseScope([])).toBeNull();
    expect(parseScope(["boh"])).toBeNull();
    expect(parseScope(["azione", "thriller"])).toBeNull();
    expect(parseScope(["netflix", "netflix"])).toBeNull();
  });
});

describe("scopePath e scopeTitle", () => {
  it("scrive il genere prima delle piattaforme (ordine del catalogo), e `/` senza filtri", () => {
    expect(scopePath(HOME_SCOPE_VUOTO)).toBe("/");
    expect(scopePath({ genre: azione, platforms: [] })).toBe("/home/azione");
    expect(scopePath({ genre: null, platforms: [netflix] })).toBe("/home/netflix");
    expect(scopePath({ genre: azione, platforms: [netflix] })).toBe(
      "/home/azione/netflix",
    );
    expect(scopePath({ genre: null, platforms: [prime, netflix] })).toBe(
      "/home/netflix/prime-video",
    );
    expect(scopeCanonico(["netflix", "azione"], parseScope(["netflix", "azione"])!)).toBe(
      false,
    );
    expect(scopeCanonico(["azione", "netflix"], parseScope(["azione", "netflix"])!)).toBe(
      true,
    );
  });

  it("titola l'ambito in italiano", () => {
    expect(scopeTitle(HOME_SCOPE_VUOTO)).toBeNull();
    expect(scopeTitle({ genre: azione, platforms: [] })).toBe("Azione");
    expect(scopeTitle({ genre: null, platforms: [netflix] })).toBe("Su Netflix");
    expect(scopeTitle({ genre: azione, platforms: [netflix] })).toBe("Azione su Netflix");
    expect(scopeTitle({ genre: null, platforms: [netflix, prime] })).toBe(
      "Su Netflix e Prime Video",
    );
    expect(scopeVuoto(HOME_SCOPE_VUOTO)).toBe(true);
  });

  it("le chiavi di generi e piattaforme non si sovrappongono: ogni segmento è univoco", () => {
    const generi = new Set(GENRES.map((g) => g.key));
    for (const p of PLATFORMS) expect(generi.has(p.key)).toBe(false);
  });
});

describe("inGenre", () => {
  it("guarda i generi in or e le esclusioni, tradotti per le serie", () => {
    expect(
      inGenre(azione, { mediaType: "movie", genreIds: [28, 12], year: "2020" }),
    ).toBe(true);
    expect(inGenre(azione, { mediaType: "movie", genreIds: [35], year: "2020" })).toBe(
      false,
    );
    // 28 (film) → 10759 (serie)
    expect(inGenre(azione, { mediaType: "tv", genreIds: [10759], year: "2020" })).toBe(
      true,
    );
    // documentario: escluso ovunque non sia il tema
    expect(
      inGenre(azione, { mediaType: "movie", genreIds: [28, 99], year: "2020" }),
    ).toBe(false);
  });

  it("non sa rispondere per le voci definite da keyword o lingua", () => {
    const storieVere = genreByKey("storie-vere");
    const anime = genreByKey("anime");
    if (storieVere) {
      expect(
        inGenre(storieVere, { mediaType: "movie", genreIds: [18], year: "2020" }),
      ).toBeNull();
      expect(
        passaGenere(
          { genre: storieVere, platforms: [] },
          { mediaType: "movie", genreIds: [18], year: "2020" },
        ),
      ).toBe(false);
    }
    if (anime) {
      expect(
        inGenre(anime, { mediaType: "tv", genreIds: [16], year: "2020" }),
      ).toBeNull();
    }
  });

  it("rispetta la finestra di anni e rifiuta un anno ignoto quando la finestra c'è", () => {
    const conAnni = GENRES.find((g) => g.movie.annoMax !== undefined);
    if (!conAnni) return;
    const generi = conAnni.movie.generi.length > 0 ? [conAnni.movie.generi[0]] : [18];
    expect(
      inGenre(conAnni, {
        mediaType: "movie",
        genreIds: generi,
        year: String(conAnni.movie.annoMax! + 1),
      }),
    ).toBe(false);
    expect(inGenre(conAnni, { mediaType: "movie", genreIds: generi, year: null })).toBe(
      false,
    );
  });

  it("senza genere nell'ambito passa tutto", () => {
    expect(
      passaGenere(HOME_SCOPE_VUOTO, { mediaType: "movie", genreIds: [], year: null }),
    ).toBe(true);
  });
});
