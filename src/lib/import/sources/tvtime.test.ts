import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "./tvtime";

const campione = readFileSync("public/info/tvtime_export_example.csv", "utf8");

describe("parse (TV Time)", () => {
  it("legge il campione vero: 6 film, 5 serie, id TMDB riportato", () => {
    const out = parse([{ name: "tvtime.csv", text: campione }]);
    expect(out.rows).toBe(20);
    const movies = out.candidates.filter((c) => c.kind === "movie");
    const shows = out.candidates.filter((c) => c.kind === "tv");
    // 6 film su una riga ciascuno + 5 serie su 14 righe = le 20 righe del campione
    expect(movies).toHaveLength(6);
    expect(shows).toHaveLength(5);
    expect(movies.find((c) => c.netflixTitle === "Parasite")).toMatchObject({
      tmdbId: 496243,
      rating: 10,
      lastDate: "2024-09-01",
      status: "watched",
    });
  });

  it("di una serie tiene l'episodio più avanzato e il voto più alto", () => {
    const out = parse([{ name: "tvtime.csv", text: campione }]);
    const bb = out.candidates.find((c) => c.netflixTitle === "Breaking Bad");
    expect(bb).toMatchObject({
      kind: "tv",
      tmdbId: 1396,
      season: 1,
      episode: 3,
      rating: 10,
      rowCount: 3,
      lastDate: "2024-01-17",
    });
  });

  it("riconosce le colonne anche con nomi e ordine diversi", () => {
    const out = parse([
      {
        name: "trakt.csv",
        text: 'Type,Title,Watched Date,Season,Episode\nepisode,"Dark",2023-05-01,2,4\n',
      },
    ]);
    expect(out.candidates[0]).toMatchObject({
      kind: "tv",
      netflixTitle: "Dark",
      season: 2,
      episode: 4,
      lastDate: "2023-05-01",
      tmdbId: null,
    });
  });

  it("rifiuta un csv senza colonna titolo dicendo cosa serve", () => {
    const out = parse([{ name: "x.csv", text: "a,b\n1,2\n" }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("title");
  });

  it("deduce la scala dei voti dal file intero, non riga per riga", () => {
    // un voto sopra 5 in tutto il file basta a dire che l'export è già su 1-10
    // (Trakt/Simkl): 3, 7 e 9 restano 3, 7 e 9, non diventano 6, 10 e 10.
    const scala10 = parse([
      {
        name: "trakt.csv",
        text: "Title,Rating\nAlpha,3\nBeta,7\nGamma,9\n",
      },
    ]);
    const votiScala10 = Object.fromEntries(
      scala10.candidates.map((c) => [c.netflixTitle, c.rating]),
    );
    expect(votiScala10).toEqual({ Alpha: 3, Beta: 7, Gamma: 9 });

    // senza nessun voto sopra 5, il file resta sulla scala 1-5 (TV Time) e
    // raddoppia: 4 e 5 restano 8 e 10, come già oggi sul campione vero.
    const scala5 = parse([
      {
        name: "tvtime.csv",
        text: "Title,Rating\nDelta,4\nEpsilon,5\n",
      },
    ]);
    const votiScala5 = Object.fromEntries(
      scala5.candidates.map((c) => [c.netflixTitle, c.rating]),
    );
    expect(votiScala5).toEqual({ Delta: 8, Epsilon: 10 });
  });

  it("titolo assente ma tmdb_id presente: etichetta segnaposto, non stringa vuota", () => {
    const out = parse([{ name: "tvtime.csv", text: "Title,Tmdb Id\n,603\n" }]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      tmdbId: 603,
      netflixTitle: "TMDB 603",
    });
  });
});
