import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capitalSlug,
  formatFromLabel,
  normalizeTitle,
  parseCinemaPage,
  parseFilmProvincePage,
  parseCityIndex,
  parseFilmId,
  parseFilmPageLinks,
  parseMappa,
  parseNowShowing,
  parseProvinceIndex,
  parseProvinceList,
  provinceExists,
  provinceTokens,
  matchProvinceSlug,
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

describe("parseCityIndex", () => {
  it("elenca i cinema del capoluogo dal title, senza doppioni", () => {
    const refs = parseCityIndex(fixture("city-index.html"));
    expect(refs).toHaveLength(3);
    expect(refs.find((r) => r.id === 24450)).toEqual({
      id: 24450,
      name: "Notorious Cinemas Merlata Bloom",
      town: "Milano",
      path: "/cinema/milano/24450/",
    });
    expect(refs.find((r) => r.id === 5547)?.name).toBe("Gloria Notorious Cinemas");
  });
  it("la pagina provincia non ha righe di questa forma", () => {
    expect(parseCityIndex(fixture("province-index.html"))).toEqual([]);
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
  it("con lat/lng vuoti tiene nome, indirizzo e comune (coordinate null)", () => {
    const html = fixture("mappa.html").replace(
      /lat=-?[0-9.]+&lng=-?[0-9.]+/,
      "lat=&lng=",
    );
    const m = parseMappa(html);
    expect(m?.lat).toBeNull();
    expect(m?.lng).toBeNull();
    expect(m?.address).toBeTruthy();
  });

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

describe("provinceExists", () => {
  const h1 = `<h1>
   Cinema provincia di Milano
</h1>`;
  it("riconosce una provincia vera anche senza spettacoli (indice vuoto di notte)", () => {
    expect(parseProvinceIndex(h1)).toEqual([]);
    expect(provinceExists(h1)).toBe(true);
  });
  it("riconosce la provincia dai cinema quando l'h1 non c'è", () => {
    expect(provinceExists(fixture("province-index.html"))).toBe(true);
  });
  it("dice di no su uno slug inventato (pagina 200 senza h1 e senza cinema)", () => {
    expect(provinceExists("<html><body>Provincia di pincopallino</body></html>")).toBe(
      false,
    );
  });
});

describe("parseProvinceList", () => {
  it("elenca slug e nome delle province", () => {
    const list = parseProvinceList(fixture("province-list.html"));
    expect(list).toContainEqual({ slug: "monzabrianza", name: "Monza Brianza" });
    expect(list).toContainEqual({ slug: "pesaroeurbino", name: "Pesaro e Urbino" });
    expect(list.map((p) => p.slug)).toContain("forlicesena");
  });
  it("torna vuoto su HTML senza elenco", () => {
    expect(parseProvinceList("<html></html>")).toEqual([]);
  });
});

describe("provinceTokens", () => {
  it("toglie le parole che i due elenchi scrivono in modo diverso", () => {
    expect(provinceTokens("Monza e Brianza")).toEqual(["monza", "brianza"]);
    expect(provinceTokens("Monza Brianza")).toEqual(["monza", "brianza"]);
    expect(provinceTokens("Reggio nell'Emilia")).toEqual(["reggio", "emilia"]);
    expect(provinceTokens("Forlì-Cesena")).toEqual(["forli", "cesena"]);
    expect(provinceTokens("Città metropolitana di Milano")).toEqual(["milano"]);
  });
});

describe("matchProvinceSlug", () => {
  const list = parseProvinceList(fixture("province-list.html"));
  it("mappa i nomi Nominatim sullo slug MyMovies", () => {
    expect(matchProvinceSlug(list, "Milano")).toBe("milano");
    expect(matchProvinceSlug(list, "Monza e Brianza")).toBe("monzabrianza");
    expect(matchProvinceSlug(list, "Pesaro e Urbino")).toBe("pesaroeurbino");
    expect(matchProvinceSlug(list, "Reggio nell'Emilia")).toBe("reggioemilia");
    expect(matchProvinceSlug(list, "Forlì-Cesena")).toBe("forlicesena");
    expect(matchProvinceSlug(list, "L'Aquila")).toBe("laquila");
  });
  it("accetta un solo token quando la provincia è una sola (Bolzano/Bozen)", () => {
    expect(matchProvinceSlug(list, "Bolzano/Bozen")).toBe("bolzano");
  });
  it("non decide quando il token è ambiguo o il nome non è una provincia", () => {
    expect(matchProvinceSlug(list, "Bareggio")).toBe(null);
    expect(matchProvinceSlug(list, "")).toBe(null);
  });
});

describe("parseNowShowing sulla pagina della città", () => {
  it("prende sia i link col title sia quelli col solo testo", () => {
    expect(parseNowShowing(fixture("city-films.html"))).toEqual([
      { filmId: 119782, title: "Coyote Vs. Acme" },
      { filmId: 105402, title: "Oceania" },
      { filmId: 116468, title: "Odissea" },
    ]);
  });
});

describe("parseFilmPageLinks", () => {
  it("dà titolo, anno e slug delle locandine in pagina", () => {
    expect(parseFilmPageLinks(fixture("province-locandine.html"))).toEqual([
      { year: 2026, slug: "coyote-vs-acme", title: "Coyote Vs. Acme" },
      { year: 2026, slug: "oceania", title: "Oceania" },
      { year: 2026, slug: "sunny-dancer", title: "Sunny Dancer" },
    ]);
  });
});

describe("parseFilmId", () => {
  it("legge l'id dalla scheda del film", () => {
    expect(parseFilmId(fixture("film-page.html"))).toBe(116468);
  });
  it("null se la scheda non lo espone", () => {
    expect(parseFilmId("<html></html>")).toBeNull();
  });
});

describe("capitalSlug", () => {
  it("torna lo slug del capoluogo dove non coincide con la provincia", () => {
    expect(capitalSlug("monzabrianza")).toBe("monza");
    expect(capitalSlug("forlicesena")).toBe("forli");
    expect(capitalSlug("verbanocusioossola")).toBe("verbania");
  });
  it("altrimenti lo slug della provincia", () => {
    expect(capitalSlug("milano")).toBe("milano");
    expect(capitalSlug("bari")).toBe("bari");
  });
});
