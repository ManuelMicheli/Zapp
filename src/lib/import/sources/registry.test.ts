import { describe, expect, it } from "vitest";
import { isSourceSlug, parseSource, SOURCE_LIST, SOURCES } from "./registry";

describe("registry", () => {
  it("elenca le quattro sorgenti con slug coerenti", () => {
    expect(SOURCE_LIST.map((s) => s.slug)).toEqual([
      "netflix",
      "letterboxd",
      "tvtime",
      "file",
    ]);
    for (const meta of SOURCE_LIST) expect(SOURCES[meta.slug]).toBe(meta);
    expect(isSourceSlug("netflix")).toBe(true);
    expect(isSourceSlug("trakt")).toBe(false);
  });

  it("smista al parser giusto: Netflix resta Netflix", () => {
    const out = parseSource("netflix", [
      {
        name: "NetflixViewingHistory.csv",
        text: 'Title,Date\n"Dark: Stagione 1: Segreti","05/12/2023"\n',
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates[0]).toMatchObject({ kind: "tv", netflixTitle: "Dark" });
  });

  it("smista al parser giusto: Letterboxd resta Letterboxd", () => {
    // Voto 8: fuori dalla scala 0,5-5 di Letterboxd (torna null), ma un csv a
    // colonne (TV Time o file generico) lo leggerebbe come scala 1-10 e terrebbe 8.
    // Un cambio di rotta verso quei parser si vede da questo campo, non dal titolo.
    const out = parseSource("letterboxd", [
      {
        name: "watched.csv",
        text: "Date,Name,Year,Rating,Letterboxd URI\n2023-05-12,Dune,2021,8,https://boxd.it/xyz\n",
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      kind: "movie",
      netflixTitle: "Dune",
      year: "2021",
      rating: null,
    });
  });

  it("smista al parser giusto: TV Time resta TV Time", () => {
    // Un secondo file .json accanto al csv: TV Time lo scarta (legge solo csv),
    // un file generico lo leggerebbe anche lui e conterebbe una riga e un
    // candidato in più. Letterboxd non riconosce nessuno dei due nomi e non
    // produce nulla. Il conteggio smaschera qualunque scambio.
    const out = parseSource("tvtime", [
      {
        name: "tvtime_export.csv",
        text: "type,title,season,episode,watched_date,tmdb_id\nshow,Dark,1,1,2024-01-01,42009\n",
      },
      {
        name: "extra.json",
        text: '{"watch_entries":[{"title_id":999,"media_type":"movie"}]}',
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({ kind: "tv", tmdbId: 42009 });
  });

  it("smista al parser giusto: il backup Zapp resta un file", () => {
    // Estensione .json: TV Time lo scarta del tutto (legge solo csv) e Letterboxd
    // non riconosce il nome, quindi entrambi tornerebbero vuoti invece del
    // candidato atteso.
    const out = parseSource("file", [
      {
        name: "zapp.json",
        text: '{"watch_entries":[{"title_id":278,"media_type":"movie","status":"watched"}]}',
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({ kind: "movie", tmdbId: 278 });
  });
});
