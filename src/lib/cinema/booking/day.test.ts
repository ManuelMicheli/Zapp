import { describe, expect, it } from "vitest";
import notoriousSched from "./__fixtures__/notorious-scheduling.json";
import uciProgramming from "./__fixtures__/uci-programming.json";
import webticCinelandia from "./__fixtures__/webtic-cinelandia.json";
import {
  pickChainFilm,
  uciDayProgramme,
  uciFormat,
  webticBaseTitle,
  webticDayProgramme,
  webticVariantFormat,
  type ChainFilm,
} from "./day";
import { webticPerformanceUrl } from "./webtic";

const UCI = "https://ucicinemas.it";

describe("uciFormat", () => {
  it("2D è lo standard, gli altri formati normalizzati", () => {
    expect(uciFormat("2D", null)).toBe("standard");
    expect(uciFormat("3D", null)).toBe("3d");
    expect(uciFormat("IMAX", null)).toBe("imax");
    expect(uciFormat("IMAX 3D", null)).toBe("imax3d");
  });
  it("lingua non italiana → versione originale", () => {
    expect(uciFormat("2D", "ENG")).toBe("vos");
    expect(uciFormat("2D", "ITA")).toBe("standard");
  });
});

describe("uciDayProgramme", () => {
  it("un film per voce, orari del giorno con link carrello (livello 2)", () => {
    const out = uciDayProgramme(uciProgramming.data, "2026-09-06", UCI);
    expect(out).toHaveLength(1);
    const film = out[0];
    expect(film.title).toBe("Coyote vs ACME");
    expect(film.showings.map((s) => s.time)).toEqual(["20:20", "21:20", "22:15"]);
    expect(film.showings[0]).toEqual({
      time: "20:20",
      format: "standard",
      url: `${UCI}/movies/coyote-vs-acme/acquista/5068/9797/1007876`,
      level: 2,
    });
  });
  it("giorno senza spettacoli → film escluso", () => {
    expect(uciDayProgramme(uciProgramming.data, "2026-09-07", UCI)).toEqual([]);
  });
});

describe("webticBaseTitle / webticVariantFormat", () => {
  it("toglie i prefissi di variante", () => {
    expect(webticBaseTitle("(Lingua Orig.) Coyote Vs Acme")).toBe("Coyote Vs Acme");
    expect(webticBaseTitle("Cinemamma - Coyote Vs Acme")).toBe("Coyote Vs Acme");
    expect(webticBaseTitle("Oceania (2026)")).toBe("Oceania (2026)");
  });
  it("riconosce versione originale e 3D", () => {
    expect(webticVariantFormat("(Lingua Orig.) Coyote Vs Acme")).toBe("vos");
    expect(webticVariantFormat("Coyote Vs Acme 3D")).toBe("3d");
    expect(webticVariantFormat("Cinemamma - Coyote Vs Acme")).toBe("standard");
  });
});

describe("webticDayProgramme", () => {
  const events = webticCinelandia.DS.Scheduling.Events;
  it("fonde le varianti dello stesso film e ordina gli orari", () => {
    const out = webticDayProgramme(events, "2026-09-07", (e, p) =>
      webticPerformanceUrl(5343, e, p),
    );
    expect(out.map((f) => f.title)).toEqual(["Coyote Vs Acme", "Oceania (2026)"]);
    const coyote = out[0];
    expect(coyote.originalTitle).toBe("Coyote vs ACME");
    expect(coyote.showings.map((s) => `${s.time} ${s.format}`)).toEqual([
      "17:20 standard",
      "20:10 standard",
      "20:30 vos",
    ]);
    expect(coyote.showings[2]).toMatchObject({
      url: webticPerformanceUrl(5343, 3892, 141197),
      level: 2,
    });
  });
  it("il giorno dopo ha solo le voci con spettacoli", () => {
    const out = webticDayProgramme(events, "2026-09-08", (e, p) => `${e}/${p}`);
    expect(out.map((f) => f.title)).toEqual(["Coyote Vs Acme", "Oceania (2026)"]);
    expect(out[0].showings.map((s) => s.time)).toEqual(["17:20", "20:10"]);
    expect(out[0].showings[0].url).toBe("3878/141168");
  });
  it("Notorious: Cinemamma resta standard e si fonde col film", () => {
    const out = webticDayProgramme(
      notoriousSched.DS.Scheduling.Events,
      "2026-09-07",
      (e, p) => `${e}/${p}`,
    );
    const coyote = out.find((f) => f.originalTitle === "Coyote vs ACME")!;
    expect(coyote.title).toBe("Coyote Vs Acme");
    expect(coyote.showings.map((s) => s.time)).toEqual([
      "14:15",
      "14:40",
      "17:00",
      "19:30",
    ]);
  });
  it("giorno assente → vuoto", () => {
    expect(webticDayProgramme(events, "2026-09-20", (e, p) => `${e}/${p}`)).toEqual([]);
  });
});

describe("pickChainFilm", () => {
  const films: ChainFilm[] = [
    { title: "Coyote Vs Acme", originalTitle: "Coyote vs ACME", showings: [] },
    { title: "Oceania (2026)", originalTitle: "Oceania (2026)", showings: [] },
  ];
  it("trova per titolo italiano o originale", () => {
    expect(pickChainFilm(films, { title: "Coyote vs. Acme", originalTitle: null })).toBe(
      films[0],
    );
    expect(
      pickChainFilm(films, { title: "Oceania", originalTitle: "Moana (2026)" }),
    ).toBe(films[1]);
  });
  it("null sotto soglia", () => {
    expect(pickChainFilm(films, { title: "Barbie", originalTitle: null })).toBeNull();
  });
});
