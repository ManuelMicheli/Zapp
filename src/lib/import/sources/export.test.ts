import { describe, expect, it } from "vitest";
import { righeACandidati } from "./export";

describe("righeACandidati", () => {
  it("fa un film visto da una riga con titolo e data", () => {
    const [c] = righeACandidati([{ Title: "Dune", Date: "2026-09-15" }]);
    expect(c).toMatchObject({
      netflixTitle: "Dune",
      kind: "movie",
      lastDate: "2026-09-15",
      status: "watched",
    });
  });

  it("scarta le riproduzioni sotto i due minuti (trailer)", () => {
    const out = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "45" },
      { Title: "Arrival", Date: "2026-09-15", Duration: "7200" },
    ]);
    expect(out.map((c) => c.netflixTitle)).toEqual(["Arrival"]);
  });

  it("manda a 'watching' quello che e' rimasto a meta'", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "40%" },
    ]);
    expect(c.status).toBe("watching");
  });

  it("tiene 'watched' sopra l'85%", () => {
    const [c] = righeACandidati([
      { Title: "Dune", Date: "2026-09-15", Duration: "3600", Progress: "0.92" },
    ]);
    expect(c.status).toBe("watched");
  });

  it("riporta la scala del voto su dieci", () => {
    const [cinque] = righeACandidati([{ Title: "Dune", Rating: "4" }]);
    expect(cinque.rating).toBe(8);
    const [cento] = righeACandidati([{ Title: "Dune", Rating: "90" }]);
    expect(cento.rating).toBe(9);
  });

  it("riconosce la serie dal titolo e porta il nome dell'episodio", () => {
    const [c] = righeACandidati([
      { Title: "The Bear: Stagione 2: Episodio 5 - Pollo", Date: "2026-09-15" },
    ]);
    expect(c).toMatchObject({
      netflixTitle: "The Bear",
      kind: "tv",
      season: 2,
      episode: 5,
      episodeTitles: ["Pollo"],
    });
  });

  it("prende il nome dell'episodio dalla colonna dedicata quando c'e'", () => {
    // colonne separate (Apple TV, NOW): il titolo non porta il nome della
    // puntata, c'e' una colonna a parte per quello.
    const [c] = righeACandidati([
      {
        Show: "The Bear",
        Season: "2",
        Episode: "5",
        "Episode Name": "Pollo",
        Date: "2026-09-15",
      },
    ]);
    expect(c).toMatchObject({
      netflixTitle: "The Bear",
      kind: "tv",
      season: 2,
      episode: 5,
      episodeTitles: ["Pollo"],
    });
  });

  it("decide giorno/mese sull'intero file, non riga per riga", () => {
    // 13 non puo' essere un mese: tutto il file e' giorno/mese
    const out = righeACandidati([
      { Title: "A", Date: "13/09/2026" },
      { Title: "B", Date: "05/09/2026" },
    ]);
    expect(out[1].lastDate).toBe("2026-09-05");
  });

  it("senza titolo non produce niente", () => {
    expect(righeACandidati([{ Title: "", Date: "2026-09-15" }])).toEqual([]);
  });
});
