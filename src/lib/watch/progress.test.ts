import { describe, expect, it } from "vitest";
import { resumeLabel, resumeRatio, samePlayingEpisode } from "./progress";

describe("resumeLabel", () => {
  it("dice i minuti su quanti", () => {
    expect(resumeLabel(1_084_000, 4_560_000)).toBe("18 min di 76");
  });

  it("senza durata dice solo dove sei", () => {
    expect(resumeLabel(1_084_000, null)).toBe("18 min");
  });

  it("sotto il minuto non dice zero", () => {
    expect(resumeLabel(20_000, 4_560_000)).toBe("appena iniziato");
  });
});

describe("resumeRatio", () => {
  it("e' la frazione, limitata a 1", () => {
    expect(resumeRatio(1_140_000, 4_560_000)).toBeCloseTo(0.25);
    expect(resumeRatio(9_000_000, 4_560_000)).toBe(1);
  });

  it("senza durata non c'e' barra", () => {
    expect(resumeRatio(1_000, null)).toBeNull();
  });
});

describe("samePlayingEpisode", () => {
  it("un film combacia con un film", () => {
    expect(
      samePlayingEpisode({ season: null, episode: null }, { season: null, episode: null }),
    ).toBe(true);
  });

  it("un film non combacia con un episodio", () => {
    expect(
      samePlayingEpisode({ season: null, episode: null }, { season: 1, episode: 3 }),
    ).toBe(false);
  });

  it("stesso episodio, stessa stagione", () => {
    expect(samePlayingEpisode({ season: 2, episode: 4 }, { season: 2, episode: 4 })).toBe(
      true,
    );
  });

  // Il caso vero: senza il pannello di pausa Netflix non espone la stagione, e
  // pretendendo l'uguaglianza il minutaggio non compariva mai per nessuna serie.
  it("la stagione sconosciuta non impedisce la corrispondenza", () => {
    expect(
      samePlayingEpisode({ season: 1, episode: 23 }, { season: null, episode: 23 }),
    ).toBe(true);
  });

  it("ma una stagione diversa dichiarata la impedisce", () => {
    expect(samePlayingEpisode({ season: 1, episode: 3 }, { season: 2, episode: 3 })).toBe(
      false,
    );
  });

  it("episodio diverso, mai", () => {
    expect(
      samePlayingEpisode({ season: 1, episode: 3 }, { season: null, episode: 4 }),
    ).toBe(false);
  });
});
