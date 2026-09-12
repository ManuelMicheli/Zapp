import { describe, expect, it } from "vitest";
import { parse } from "./letterboxd";

const watched = `Date,Name,Year,Letterboxd URI
2024-01-02,Parasite,2019,https://boxd.it/a
2024-03-04,Inception,2010,https://boxd.it/b
`;

const ratings = `Date,Name,Year,Letterboxd URI,Rating
2024-01-02,Parasite,2019,https://boxd.it/a,5
2024-03-04,Inception,2010,https://boxd.it/b,3.5
`;

const diary = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2024-01-02,Parasite,2019,https://boxd.it/a,5,No,,2023-12-30
`;

const watchlist = `Date,Name,Year,Letterboxd URI
2024-05-06,Dune,2021,https://boxd.it/c
2024-05-06,Parasite,2019,https://boxd.it/a
`;

describe("parse (Letterboxd)", () => {
  it("unisce visti e voti, convertendo le stelle sulla scala 1-10", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "ratings.csv", text: ratings },
    ]);
    expect(out.rows).toBe(4);
    const byTitle = new Map(out.candidates.map((c) => [c.netflixTitle, c]));
    expect(byTitle.get("Parasite")).toMatchObject({
      kind: "movie",
      year: "2019",
      rating: 10,
      status: "watched",
      lastDate: "2024-01-02",
    });
    expect(byTitle.get("Inception")?.rating).toBe(7);
  });

  it("la data del diario vince su quella di watched.csv", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "diary.csv", text: diary },
    ]);
    const parasite = out.candidates.find((c) => c.netflixTitle === "Parasite");
    expect(parasite?.lastDate).toBe("2023-12-30");
  });

  it("la watchlist entra come 'want', ma non tocca un film già visto", () => {
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "watchlist.csv", text: watchlist },
    ]);
    const dune = out.candidates.find((c) => c.netflixTitle === "Dune");
    const parasite = out.candidates.find((c) => c.netflixTitle === "Parasite");
    expect(dune).toMatchObject({ status: "want", lastDate: null, kind: "movie" });
    expect(parasite?.status).toBe("watched");
    expect(out.candidates).toHaveLength(3);
  });

  it("ignora le liste dell'utente, anche se si chiamano come i file veri", () => {
    // nell'export vero le liste stanno in `lists/<slug>.csv` e `archive.ts`
    // tiene solo il nome: "Watched in 2024" arriva come `watched-in-2024.csv`
    const lista = `Position,Name,Year,URL
1,Oppenheimer,2023,https://boxd.it/z
`;
    const out = parse([
      { name: "watched.csv", text: watched },
      { name: "watched-in-2024.csv", text: lista },
      { name: "my-watchlist.csv", text: lista },
    ]);
    expect(out.candidates.map((c) => c.netflixTitle).sort()).toEqual([
      "Inception",
      "Parasite",
    ]);
    expect(out.rows).toBe(2);
  });

  it("dice cosa manca quando nello zip non c'è nessun csv utile", () => {
    const out = parse([{ name: "comments.csv", text: "a,b\n1,2\n" }]);
    expect(out.candidates).toHaveLength(0);
    expect(out.error).toContain("watched.csv");
  });
});
