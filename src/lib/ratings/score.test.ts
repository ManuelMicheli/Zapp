import { describe, expect, it } from "vitest";
import { displayValue, zappScore } from "./score";

describe("zappScore", () => {
  it("tira verso la media un voto perfetto con tre voti", () => {
    // 100/100 con 3 voti su TMDB (soglia 500, media 6,6) non deve valere 10
    const r = zappScore({ tmdb: { score: 100, votes: 3 } });
    expect(r.score).toBe(6.6);
    expect(r.confidence).toBe("low");
    expect(r.votes).toBe(3);
  });

  it("lascia stare un voto alto con mezzo milione di voti", () => {
    const r = zappScore({ imdb: { score: 92, votes: 500000 } });
    expect(r.score).toBe(9.2);
    // "high" vuole almeno due fonti del pubblico: con IMDb da sola resta "medium"
    expect(r.confidence).toBe("medium");
  });

  it("mette insieme pubblico e critica su un titolo vero (Dune: Parte due)", () => {
    // Dati reali di MDBList al 2026-09-07
    const r = zappScore({
      imdb: { score: 84, votes: 790821 },
      tmdb: { score: 81, votes: 8493 },
      trakt: { score: 86, votes: 49768 },
      letterboxd: { score: 88, votes: 3610514 },
      audience: { score: 95, votes: 2246 },
      tomatoes: { score: 92, votes: 466 },
      metacritic: { score: 79, votes: 62 },
    });
    expect(r.score).toBe(8.5);
    expect(r.votes).toBe(4461842);
    expect(r.critics).toBe(528);
    expect(r.confidence).toBe("high");
    expect(r.breakdown).toHaveLength(7);
  });

  it("regge una serie in cui una fonte del pubblico non ha voti (Game of Thrones)", () => {
    const r = zappScore({
      imdb: { score: 92, votes: 2658345 },
      tmdb: { score: 85, votes: 27675 },
      trakt: { score: 89, votes: 74085 },
      audience: { score: 85, votes: 0 },
      tomatoes: { score: 89, votes: 338 },
      metacritic: { score: 86, votes: 171 },
    });
    expect(r.score).toBe(8.8);
    expect(r.votes).toBe(2760105);
    expect(r.critics).toBe(509);
    expect(r.confidence).toBe("high");
    // la fonte senza voti si vede comunque nel dettaglio
    expect(r.breakdown).toHaveLength(6);
  });

  it("non lascia che una critica scarsa di numero ribalti il pubblico", () => {
    const r = zappScore({
      imdb: { score: 85, votes: 1200000 },
      metacritic: { score: 20, votes: 12 },
    });
    // col peso pieno della critica (0,30) sarebbe 7,2: la massa critica lo riduce
    expect(r.score).toBe(7.9);
    expect(r.critics).toBe(12);
  });

  it("senza critica il pubblico prende tutto, senza distorsione", () => {
    const r = zappScore({ imdb: { score: 85, votes: 1200000 } });
    expect(r.score).toBe(8.5);
    expect(r.critics).toBe(0);
  });

  it("mostra le fonti senza voti ma non le fa pesare", () => {
    const r = zappScore({
      imdb: { score: 85, votes: 1200000 },
      audience: { score: 20, votes: 0 },
    });
    expect(r.score).toBe(8.5);
    expect(r.votes).toBe(1200000);
    expect(r.breakdown).toHaveLength(2);
  });

  it("senza nessuna fonte non inventa un numero", () => {
    const r = zappScore({});
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.breakdown).toEqual([]);
  });

  it("pesa anche Trakt, l'unica fonte altrimenti mai esercitata", () => {
    const r = zappScore({ trakt: { score: 86, votes: 49768 } });
    expect(r.votes).toBe(49768);
    expect(r.confidence).toBe("medium");
    // bayesiana: (49768 * 8,6 + 500 * 7,2) / (49768 + 500) = 8,586... → arrotondato 8,6
    expect(r.score).toBe(8.6);
  });

  it("passa a medium sopra i mille voti", () => {
    expect(zappScore({ tmdb: { score: 70, votes: 900 } }).confidence).toBe("low");
    expect(zappScore({ tmdb: { score: 70, votes: 1200 } }).confidence).toBe("medium");
  });

  it("porta nel breakdown il voto nella scala della fonte", () => {
    const r = zappScore({
      tomatoes: { score: 92, votes: 466 },
      letterboxd: { score: 88, votes: 3610514 },
      imdb: { score: 84, votes: 790821 },
    });
    expect(r.breakdown).toContainEqual({
      source: "tomatoes",
      value: 92,
      votes: 466,
      scale: "100",
    });
    expect(r.breakdown).toContainEqual({
      source: "letterboxd",
      value: 4.4,
      votes: 3610514,
      scale: "5",
    });
    expect(r.breakdown).toContainEqual({
      source: "imdb",
      value: 8.4,
      votes: 790821,
      scale: "10",
    });
  });
});

describe("displayValue", () => {
  it("scrive ogni fonte nella scala con cui si presenta", () => {
    expect(displayValue(84, "10")).toBe(8.4);
    expect(displayValue(88, "5")).toBe(4.4);
    expect(displayValue(92, "100")).toBe(92);
  });
});
