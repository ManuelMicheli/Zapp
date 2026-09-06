import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatFromLabel,
  normalizeTitle,
  parseCinemaPage,
  parseFilmProvincePage,
  parseMappa,
  parseNowShowing,
  parseProvinceIndex,
  slugify,
} from "./parse";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseProvinceIndex", () => {
  it("elenca i cinema con id, nome, comune e path", () => {
    const refs = parseProvinceIndex(fixture("province-index.html"));
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual({
      id: 20721,
      name: "Arcadia Multiplex",
      town: "Bellinzago Lombardo",
      path: "/cinema/milano/bellinzagolombardo/20721/",
    });
    expect(refs[3]).toEqual({
      id: 5452,
      name: "Multiplex Arcadia",
      town: "Melzo",
      path: "/cinema/milano/melzo/5452/",
    });
  });
  it("torna vuoto su HTML senza cinema", () => {
    expect(parseProvinceIndex("<html></html>")).toEqual([]);
  });
});

describe("parseNowShowing", () => {
  it("estrae i film in programmazione con id e titolo (senza ' a <città>')", () => {
    expect(parseNowShowing(fixture("province-index.html"))).toEqual([
      { filmId: 119782, title: "Coyote Vs. Acme" },
      { filmId: 105402, title: "Oceania" },
      { filmId: 118923, title: "Sunny Dancer" },
    ]);
  });
});

describe("parseCinemaPage", () => {
  it("estrae i film con anno, slug, id e orari per formato", () => {
    const films = parseCinemaPage(fixture("cinema-page.html"));
    expect(films).toHaveLength(2);
    expect(films[0]).toEqual({
      filmId: 117059,
      title: "Spider-Man - Brand New Day",
      year: 2026,
      slug: "spiderman-brand-new-day",
      showings: [{ format: "vos", time: "21:30" }],
    });
    expect(films[1].filmId).toBe(119820);
    expect(films[1].title).toBe("Tony - Diario di un giovane cuoco");
    expect(films[1].showings).toEqual([
      { format: "standard", time: "15:00" },
      { format: "standard", time: "18:30" },
      { format: "standard", time: "19:20" },
      { format: "vos", time: "12:50" },
      { format: "vos", time: "17:10" },
      { format: "vos", time: "21:30" },
    ]);
  });
});

describe("parseFilmProvincePage", () => {
  it("estrae i cinema che danno il film con i loro orari", () => {
    const cinemas = parseFilmProvincePage(fixture("film-province.html"));
    expect(cinemas.map((c) => c.cinemaId)).toEqual([5431, 22629, 20360]);
    expect(cinemas[0]).toEqual({
      cinemaId: 5431,
      name: "Anteo Palazzo del Cinema",
      town: "Milano",
      path: "/cinema/milano/5431/",
      showings: [{ format: "vos", time: "21:30" }],
    });
    expect(cinemas[2].showings).toEqual([
      { format: "standard", time: "16:00" },
      { format: "standard", time: "19:10" },
      { format: "standard", time: "22:15" },
    ]);
  });
});

describe("parseMappa", () => {
  it("legge coordinate, nome, indirizzo e comune dall'iframe", () => {
    expect(parseMappa(fixture("mappa.html"))).toEqual({
      lat: 45.479714,
      lng: 9.187763,
      name: "Anteo Palazzo del Cinema",
      address: "Via Milazzo 9",
      town: "Milano",
    });
  });
  it("decodifica Latin-1, '+' e '_' come spazi", () => {
    const html =
      'src="https://www.mymovies.it/ajax/mappe/googlemaps.asp?lat=45.545743&lng=9.454024&nomecinema=Arcadia+Multiplex&indirizzo=Strada+Padana+Superiore%2C+154+%2D+Localit%E0+Villa+Fornaci&local=Bellinzago%5FLombardo&altezza=450"';
    expect(parseMappa(html)).toEqual({
      lat: 45.545743,
      lng: 9.454024,
      name: "Arcadia Multiplex",
      address: "Strada Padana Superiore, 154 - Località Villa Fornaci",
      town: "Bellinzago Lombardo",
    });
    expect(parseMappa("<html></html>")).toBeNull();
  });
});

describe("helper", () => {
  it("slugify come MyMovies", () => {
    expect(slugify("Sesto San Giovanni")).toBe("sestosangiovanni");
    expect(slugify("Monza e Brianza")).toBe("monzaebrianza");
    expect(slugify("Forlì-Cesena")).toBe("forlicesena");
  });
  it("formatFromLabel", () => {
    expect(formatFromLabel("Versione originale con sottotitoli")).toBe("vos");
    expect(formatFromLabel("3D")).toBe("3d");
    expect(formatFromLabel("IMAX 3D")).toBe("imax3d");
    expect(formatFromLabel("Sala Energia")).toBe("salaenergia");
  });
  it("normalizeTitle per il confronto con TMDB", () => {
    expect(normalizeTitle("Spider-Man - Brand New Day")).toBe("spidermanbrandnewday");
    expect(normalizeTitle("Coyote Vs. Acme")).toBe(normalizeTitle("Coyote vs Acme"));
    expect(normalizeTitle("Oceania 2")).toBe("oceania2");
  });
});
