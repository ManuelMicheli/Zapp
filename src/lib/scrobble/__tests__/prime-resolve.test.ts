import { describe, expect, it } from "vitest";
import { resolvePrimeEpisode, samePrimeName } from "../providers/prime-resolve";

describe("verifica episodio Prime", () => {
  it("trova il nome oltre la stagione dichiarata dal provider", async () => {
    expect(
      await resolvePrimeEpisode(
        "Lotta in gabbia",
        [{ season_number: 1 }, { season_number: 2 }],
        async (season) => ({
          episodes: [
            {
              season_number: season,
              episode_number: 3,
              name: season === 2 ? "Lotta in gabbia" : "Altro",
            },
          ],
        }),
      ),
    ).toEqual({ season: 2, episode: 3 });
  });
  it("rifiuta nomi identici in stagioni diverse", async () => {
    expect(
      await resolvePrimeEpisode(
        "Pilot",
        [{ season_number: 1 }, { season_number: 2 }],
        async (season) => ({
          episodes: [{ season_number: season, episode_number: 1, name: "Pilot" }],
        }),
      ),
    ).toBeNull();
  });
  it("non cerca su un catalogo parziale oltre il limite", async () => {
    const seasons = Array.from({ length: 21 }, (_, i) => ({ season_number: i + 1 }));
    let loads = 0;
    expect(
      await resolvePrimeEpisode("Pilot", seasons, async () => {
        loads++;
        return { episodes: [] };
      }),
    ).toBeNull();
    expect(loads).toBe(0);
  });
  it("non supera tre richieste contemporanee", async () => {
    let active = 0;
    let peak = 0;
    await resolvePrimeEpisode(
      "Pilot",
      Array.from({ length: 8 }, (_, i) => ({ season_number: i + 1 })),
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return { episodes: [] };
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("non accetta sottotitoli o nomi vagamente simili", () => {
    expect(samePrimeName("Reacher", "Jack Reacher")).toBe(false);
    expect(samePrimeName("Un piccolo passo", "Un piccolo passo avanti")).toBe(false);
    expect(samePrimeName("Lotta in gabbia", "LOTTA IN GABBIA!")).toBe(true);
  });
});
