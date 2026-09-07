import { describe, expect, it } from "vitest";
import { zappScore } from "./score";

describe("zappScore", () => {
  it("tira verso la media un voto perfetto con tre voti", () => {
    // 10/10 con 3 voti su TMDB (soglia 500, media 6,6) non deve valere 10
    const r = zappScore({ tmdb: { value: 10, votes: 3 } });
    expect(r.score).toBe(6.6);
    expect(r.confidence).toBe("low");
    expect(r.votes).toBe(3);
  });

  it("lascia stare un voto alto con mezzo milione di voti", () => {
    const r = zappScore({ imdb: { value: 9.2, votes: 500000 } });
    expect(r.score).toBe(9.2);
    expect(r.votes).toBe(500000);
    // "high" vuole almeno due fonti del pubblico: con IMDb da sola resta "medium"
    expect(r.confidence).toBe("medium");
  });

  it("mette insieme pubblico e critica su un titolo completo", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      tmdb: { value: 8.2, votes: 11000 },
      letterboxd: { value: 4.3, votes: 890000 },
      audience: { value: 95, votes: 250000 },
      tomatoes: { value: 92, votes: 410 },
      metacritic: { value: 79, votes: 67 },
    });
    expect(r.score).toBe(8.6);
    expect(r.votes).toBe(2351000);
    expect(r.critics).toBe(477);
    expect(r.confidence).toBe("high");
    expect(r.breakdown).toHaveLength(6);
  });

  it("non lascia che un critico solo ribalti il voto del pubblico", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      rogerebert: { value: 1, votes: 1 },
    });
    // col peso pieno della critica (0,30) sarebbe 7,3: la massa critica lo riduce
    expect(r.score).toBe(8.4);
    expect(r.critics).toBe(1);
  });

  it("senza critica il pubblico prende tutto, senza distorsione", () => {
    const solo = zappScore({ imdb: { value: 8.5, votes: 1200000 } });
    expect(solo.score).toBe(8.5);
    expect(solo.critics).toBe(0);
  });

  it("con la sola critica dà un voto ma non si fida", () => {
    const r = zappScore({ rogerebert: { value: 4, votes: 1 } });
    expect(r.score).toBe(8.3);
    expect(r.confidence).toBe("low");
    expect(r.votes).toBe(0);
  });

  it("mostra le fonti senza voti ma non le fa pesare", () => {
    const r = zappScore({
      imdb: { value: 8.5, votes: 1200000 },
      rogerebert: { value: 1, votes: 0 },
    });
    expect(r.score).toBe(8.5);
    expect(r.critics).toBe(0);
    expect(r.breakdown).toHaveLength(2);
  });

  it("senza nessuna fonte non inventa un numero", () => {
    const r = zappScore({});
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.breakdown).toEqual([]);
  });

  it("passa a medium sopra i mille voti", () => {
    expect(zappScore({ tmdb: { value: 7, votes: 900 } }).confidence).toBe("low");
    expect(zappScore({ tmdb: { value: 7, votes: 1200 } }).confidence).toBe("medium");
  });

  it("porta nel breakdown la scala nativa di ogni fonte", () => {
    const r = zappScore({
      tomatoes: { value: 92, votes: 410 },
      letterboxd: { value: 4.3, votes: 100 },
    });
    expect(r.breakdown).toContainEqual({
      source: "tomatoes",
      value: 92,
      votes: 410,
      scale: "100",
    });
    expect(r.breakdown).toContainEqual({
      source: "letterboxd",
      value: 4.3,
      votes: 100,
      scale: "5",
    });
  });
});
