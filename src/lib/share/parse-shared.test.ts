import { describe, expect, it } from "vitest";
import { parseShared, textQuery } from "./parse-shared";

// Le forme d'URL sono quelle che le app di streaming mettono davvero nel
// foglio "Condividi": percorsi di scheda, percorsi di riproduzione e testi
// promozionali con il link in coda.

describe("parseShared — Netflix", () => {
  it("riconosce la scheda e la riporta alla forma canonica", () => {
    expect(parseShared({ url: "https://www.netflix.com/title/80057281" })).toEqual({
      kind: "provider",
      providerId: 8,
      url: "https://www.netflix.com/title/80057281",
    });
  });

  it("accetta il prefisso di lingua", () => {
    expect(parseShared({ url: "https://www.netflix.com/it/title/80057281" })).toEqual({
      kind: "provider",
      providerId: 8,
      url: "https://www.netflix.com/title/80057281",
    });
  });

  it("tratta /watch/<id> come una scheda: la risoluzione dira' se e' un episodio", () => {
    expect(
      parseShared({ url: "https://www.netflix.com/watch/80057281?trackId=255824129" }),
    ).toEqual({
      kind: "provider",
      providerId: 8,
      url: "https://www.netflix.com/title/80057281",
    });
  });

  it("accetta anche http e il dominio senza www", () => {
    expect(parseShared({ url: "http://netflix.com/title/80057281" })).toEqual({
      kind: "provider",
      providerId: 8,
      url: "https://www.netflix.com/title/80057281",
    });
  });

  it("da un percorso senza titolo ricade sul testo", () => {
    expect(parseShared({ url: "https://www.netflix.com/browse", text: "Dark" })).toEqual({
      kind: "text",
      query: "Dark",
      year: null,
    });
  });

  it("pesca il link dentro il testo condiviso da Netflix", () => {
    expect(
      parseShared({
        text: "Guarda Dark su Netflix https://www.netflix.com/title/80100172",
      }),
    ).toEqual({
      kind: "provider",
      providerId: 8,
      url: "https://www.netflix.com/title/80100172",
    });
  });
});

describe("parseShared — Prime Video", () => {
  it("tiene l'id di dettaglio e butta il tracking", () => {
    expect(
      parseShared({
        url: "https://www.primevideo.com/detail/0GLPHY4WQ0VQ0B7PDDYZ6BQMSV/ref=atv_dp_share_cu_r",
      }),
    ).toEqual({
      kind: "provider",
      providerId: 119,
      url: "https://www.primevideo.com/detail/0GLPHY4WQ0VQ0B7PDDYZ6BQMSV",
    });
  });

  it("riconosce /detail/ anche dentro un percorso Amazon", () => {
    expect(
      parseShared({
        url: "https://www.amazon.it/gp/video/detail/B08XYZ1234/ref=atv_dp_share_r",
      }),
    ).toEqual({
      kind: "provider",
      providerId: 119,
      url: "https://www.primevideo.com/detail/B08XYZ1234",
    });
  });
});

describe("parseShared — Disney+", () => {
  const uuid = "9dc6f0a1-4e3b-4a0a-9f1e-1a2b3c4d5e6f";

  it("riconosce la scheda entity", () => {
    expect(
      parseShared({ url: `https://www.disneyplus.com/browse/entity-${uuid}` }),
    ).toEqual({
      kind: "provider",
      providerId: 337,
      url: `https://www.disneyplus.com/browse/entity-${uuid}`,
    });
  });

  it("riporta il player alla scheda, anche col locale", () => {
    expect(parseShared({ url: `https://www.disneyplus.com/it-it/play/${uuid}` })).toEqual(
      {
        kind: "provider",
        providerId: 337,
        url: `https://www.disneyplus.com/browse/entity-${uuid}`,
      },
    );
  });

  it("dallo slug di un film ricava una ricerca testuale", () => {
    expect(
      parseShared({
        url: "https://www.disneyplus.com/it-it/movies/il-re-leone/3wRIJ4sgcQrX",
      }),
    ).toEqual({ kind: "text", query: "il re leone", year: null });
  });

  it("dallo slug di una serie ricava una ricerca testuale", () => {
    expect(
      parseShared({
        url: "https://www.disneyplus.com/series/the-mandalorian/3jLIGMDYINqD",
      }),
    ).toEqual({ kind: "text", query: "the mandalorian", year: null });
  });
});

describe("parseShared — NOW, IMDb, TMDB, JustWatch", () => {
  it("NOW non ha schede: resta lo slug come testo", () => {
    expect(
      parseShared({ url: "https://www.nowtv.it/watch/asset/the-last-of-us/R_123456_HD" }),
    ).toEqual({ kind: "text", query: "the last of us", year: null });
  });

  it("IMDb", () => {
    expect(parseShared({ url: "https://www.imdb.com/title/tt0903747/" })).toEqual({
      kind: "imdb",
      imdbId: "tt0903747",
    });
  });

  it("TMDB con lo slug", () => {
    expect(
      parseShared({ url: "https://www.themoviedb.org/movie/693134-dune-part-two" }),
    ).toEqual({ kind: "tmdb", mediaType: "movie", id: 693134 });
  });

  it("TMDB senza slug", () => {
    expect(parseShared({ url: "https://www.themoviedb.org/tv/1396" })).toEqual({
      kind: "tmdb",
      mediaType: "tv",
      id: 1396,
    });
  });

  it("JustWatch film e serie", () => {
    expect(parseShared({ url: "https://www.justwatch.com/it/film/il-padrino" })).toEqual({
      kind: "text",
      query: "il padrino",
      year: null,
    });
    expect(parseShared({ url: "https://www.justwatch.com/it/serie-tv/dark" })).toEqual({
      kind: "text",
      query: "dark",
      year: null,
    });
  });
});

describe("parseShared — quel che non si apre", () => {
  it("solo http(s)", () => {
    expect(parseShared({ url: "javascript:alert(1)" })).toBeNull();
    expect(parseShared({ url: "ftp://example.com/film" })).toBeNull();
  });

  it("host sconosciuto senza testo", () => {
    expect(parseShared({ url: "https://example.com/qualcosa" })).toBeNull();
  });

  it("host sconosciuto con testo", () => {
    expect(parseShared({ url: "https://example.com/x", text: "Dune (2021)" })).toEqual({
      kind: "text",
      query: "Dune",
      year: 2021,
    });
  });

  it("niente url e niente testo", () => {
    expect(parseShared({})).toBeNull();
  });
});

describe("textQuery", () => {
  it("toglie il link e la cornice promozionale", () => {
    expect(
      textQuery("Guarda Dark su Netflix https://www.netflix.com/title/80100172"),
    ).toEqual({ query: "Dark", year: null });
  });

  it("toglie i suffissi delle altre piattaforme", () => {
    expect(textQuery("Dai un'occhiata a The Boys | Prime Video")).toEqual({
      query: "The Boys",
      year: null,
    });
    expect(textQuery("Watch Loki on Netflix")).toEqual({ query: "Loki", year: null });
    expect(textQuery("The Godfather - IMDb")).toEqual({
      query: "The Godfather",
      year: null,
    });
  });

  it("stacca l'anno fra parentesi e quello in coda", () => {
    expect(textQuery("Dune (2021)")).toEqual({ query: "Dune", year: 2021 });
    expect(textQuery("Dune 2021")).toEqual({ query: "Dune", year: 2021 });
  });

  it("non scambia per anno il numero che fa parte del titolo", () => {
    expect(textQuery("Blade Runner 2049")).toEqual({
      query: "Blade Runner 2049",
      year: null,
    });
  });

  it("testo vuoto o di sole cifre", () => {
    expect(textQuery("")).toBeNull();
    expect(textQuery("   ")).toBeNull();
    expect(textQuery("123456")).toBeNull();
    expect(textQuery("https://www.netflix.com/browse")).toBeNull();
  });

  it("tronca i testi lunghi a 120 caratteri", () => {
    const lungo = "Un titolo lunghissimo ".repeat(12);
    const out = textQuery(lungo);
    expect(out).not.toBeNull();
    expect(out?.query.length).toBeLessThanOrEqual(120);
    expect(out?.query.startsWith("Un titolo lunghissimo")).toBe(true);
  });

  it("collassa gli spazi", () => {
    expect(textQuery("  Il   Padrino  ")).toEqual({ query: "Il Padrino", year: null });
  });
});
