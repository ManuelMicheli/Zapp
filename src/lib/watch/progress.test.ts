import { describe, expect, it } from "vitest";
import {
  playbackTime,
  resumeEpisode,
  resumeLabel,
  resumeRatio,
  samePlayingEpisode,
} from "./progress";

describe("resumeLabel", () => {
  it("dice i minuti su quanti", () => {
    expect(resumeLabel(1_084_000, 4_560_000)).toBe("Riprendi da 18:04");
  });

  it("senza durata dice solo dove sei", () => {
    expect(resumeLabel(1_084_000, null)).toBe("Riprendi da 18:04");
  });

  it("sotto il minuto non dice zero", () => {
    expect(resumeLabel(20_000, 4_560_000)).toBe("Riprendi da 0:20");
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
      samePlayingEpisode(
        { season: null, episode: null },
        { season: null, episode: null },
      ),
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

describe("punto di ripresa persistente", () => {
  const base = { season: 1, episode: 1, pct: 0 };
  const saved = { position_ms: 1_122_000, position_season: 1, position_episode: 5 };
  it("dopo chiusura e scadenza live resta E5, non E1", () => {
    expect(resumeEpisode(base, saved)).toEqual({ season: 1, episode: 5, pct: 0 });
    expect(resumeLabel(saved.position_ms)).toBe("Riprendi da 18:42");
  });
  it("non perde la posizione oltre un'ora", () => {
    expect(resumeLabel(3_722_000)).toBe("Riprendi da 1:02:02");
  });
  it("un episodio nuovo live precede quello salvato", () => {
    expect(resumeEpisode(base, saved, { seasonNumber: 2, episodeNumber: 1 })).toEqual({
      season: 2,
      episode: 1,
      pct: 0,
    });
  });
  it("dopo completamento usa il prossimo episodio", () => {
    expect(resumeEpisode(base, { ...saved, position_ms: null })).toEqual(base);
  });
});

describe("tempo sulla linea di ripresa", () => {
  it("mostra secondi e ore senza arrotondare al minuto", () => {
    expect(playbackTime(1122000)).toBe("18:42");
    expect(playbackTime(4806000)).toBe("1:20:06");
    expect(playbackTime(0)).toBe("0:00");
  });
  it("non inventa un minutaggio per misure mancanti o non valide", () => {
    expect(playbackTime(null)).toBeNull();
    expect(playbackTime(-1)).toBeNull();
    expect(playbackTime(Number.NaN)).toBeNull();
    expect(playbackTime(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
