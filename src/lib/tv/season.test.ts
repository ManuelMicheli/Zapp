import { describe, expect, it } from "vitest";
import { toSeasonDetail } from "./season";

const season = {
  season_number: 2,
  name: "Stagione 2",
  overview: "La guerra…",
  episodes: [
    {
      episode_number: 1,
      name: "Il Nord ricorda",
      overview: "…",
      still_path: "/e1.jpg",
      air_date: "2012-04-01",
      runtime: 53,
    },
    {
      episode_number: 2,
      name: "Le terre della notte",
      overview: null,
      still_path: null,
      air_date: "2012-04-08",
      runtime: null,
    },
    {
      episode_number: 3,
      name: "Ciò che è morto non muoia",
      overview: "…",
      still_path: "/e3.jpg",
      air_date: "2012-04-15",
      runtime: 53,
    },
  ],
} as never;

describe("toSeasonDetail", () => {
  it("spunta gli episodi fino all'ultimo finito e mette il minuto sull'episodio in corso", () => {
    const d = toSeasonDetail(season, {
      status: "watching",
      rating: null,
      season_number: 2,
      episode_number: 1,
      position_ms: 600000,
      position_season: 2,
      position_episode: 2,
    } as never);
    expect(d.number).toBe(2);
    expect(d.episodes.map((e) => e.watched)).toEqual([true, false, false]);
    expect(d.episodes[1].resumeMs).toBe(600000);
    expect(d.episodes[0].resumeMs).toBeNull();
    expect(d.episodes[0].runtimeMin).toBe(53);
  });
  it("stagione precedente tutta vista, successiva niente", () => {
    const vista = toSeasonDetail(season, {
      status: "watching",
      rating: null,
      season_number: 3,
      episode_number: 1,
      position_ms: null,
      position_season: null,
      position_episode: null,
    } as never);
    expect(vista.episodes.every((e) => e.watched)).toBe(true);
    const futura = toSeasonDetail(season, {
      status: "watching",
      rating: null,
      season_number: 1,
      episode_number: 9,
      position_ms: null,
      position_season: null,
      position_episode: null,
    } as never);
    expect(futura.episodes.some((e) => e.watched)).toBe(false);
  });
  it("senza entry niente spunte", () => {
    expect(toSeasonDetail(season, null).episodes.every((e) => !e.watched)).toBe(true);
  });
});
