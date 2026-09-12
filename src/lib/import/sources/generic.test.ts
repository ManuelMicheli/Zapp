import { describe, expect, it } from "vitest";
import { parse } from "./generic";

const backup = JSON.stringify({
  profilo: { username: "manu" },
  watch_entries: [
    {
      title_id: 1396,
      media_type: "tv",
      status: "watching",
      rating: 9,
      season_number: 4,
      episode_number: 2,
      last_watched_at: "2025-02-03T21:00:00Z",
    },
    {
      title_id: 278,
      media_type: "movie",
      status: "want",
      rating: null,
      season_number: null,
      episode_number: null,
      last_watched_at: null,
    },
  ],
});

describe("parse (file)", () => {
  it("rilegge un backup Zapp senza passare da TMDB", () => {
    const out = parse([{ name: "zapp.json", text: backup }]);
    expect(out.rows).toBe(2);
    expect(out.candidates[0]).toMatchObject({
      tmdbId: 1396,
      kind: "tv",
      season: 4,
      episode: 2,
      rating: 9,
      status: "watched",
      lastDate: "2025-02-03",
    });
    expect(out.candidates[1]).toMatchObject({ tmdbId: 278, status: "want" });
  });

  it("butta i voti fuori scala del backup invece di passarli al DB", () => {
    // `rating: 0` e' come parecchi export scrivono "non votato"; il check di
    // `watch_entries` e' `between 1 and 10`, e una riga sola faceva fallire la
    // scrittura dell'intero blocco.
    const fuoriScala = JSON.stringify({
      watch_entries: [
        { title_id: 1, media_type: "movie", rating: 0 },
        { title_id: 2, media_type: "movie", rating: 11 },
        { title_id: 3, media_type: "movie", rating: 7 },
      ],
    });
    const out = parse([{ name: "zapp.json", text: fuoriScala }]);
    expect(out.candidates.map((c) => c.rating)).toEqual([null, null, 7]);
  });

  it("legge un elenco JSON generico di titoli", () => {
    const out = parse([
      {
        name: "miei-film.json",
        text: JSON.stringify([
          { title: "Dune", year: 2021, type: "movie", rating: 4, date: "2024-01-01" },
          { title: "Dark", type: "tv", season: 2, episode: 8 },
        ]),
      },
    ]);
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates.find((c) => c.netflixTitle === "Dune")).toMatchObject({
      kind: "movie",
      year: "2021",
      rating: 8,
      lastDate: "2024-01-01",
    });
    expect(out.candidates.find((c) => c.netflixTitle === "Dark")).toMatchObject({
      kind: "tv",
      season: 2,
      episode: 8,
    });
  });

  it("legge un csv generico con le colonne riconosciute", () => {
    const out = parse([
      { name: "roba.csv", text: "title,type,watched_date\nParasite,movie,2024-09-01\n" },
    ]);
    expect(out.candidates[0]).toMatchObject({
      netflixTitle: "Parasite",
      kind: "movie",
      lastDate: "2024-09-01",
    });
  });

  it("spiega cosa non ha capito quando il JSON non è né un backup né un elenco", () => {
    const out = parse([{ name: "x.json", text: '{"foo":1}' }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("backup Zapp");
  });
});
