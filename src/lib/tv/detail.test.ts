import { describe, expect, it } from "vitest";
import { toTitleDetail } from "./detail";

const title = {
  id: 1399,
  media_type: "tv",
  title: "Il Trono di Spade",
  original_title: "Game of Thrones",
  overview: "Nove famiglie…",
  poster_path: "/p.jpg",
  backdrop_path: "/b.jpg",
  release_date: "2011-04-17",
  vote_average: 8.4,
  vote_count: 20000,
  genres: [
    { id: 18, name: "Dramma" },
    { id: 10765, name: "Sci-Fi & Fantasy" },
  ],
  runtime: 60,
  number_of_seasons: 8,
  number_of_episodes: 73,
  seasons: [
    {
      season_number: 0,
      name: "Speciali",
      episode_count: 10,
      air_date: null,
      poster_path: null,
    },
    {
      season_number: 1,
      name: "Stagione 1",
      episode_count: 10,
      air_date: "2011-04-17",
      poster_path: "/s1.jpg",
    },
    {
      season_number: 2,
      name: "Stagione 2",
      episode_count: 10,
      air_date: "2012-04-01",
      poster_path: null,
    },
  ],
  raw: {
    tagline: "L'inverno sta arrivando",
    credits: {
      cast: [{ name: "Emilia Clarke", character: "Daenerys", profile_path: "/e.jpg" }],
    },
  },
  fetched_at: "2026-09-01T00:00:00Z",
  external_ids: null,
} as never;

const providers = [
  {
    title_id: 1399,
    media_type: "tv",
    provider_id: 8,
    provider_name: "Netflix",
    logo_path: "/n.jpg",
    kind: "flatrate",
  },
  {
    title_id: 1399,
    media_type: "tv",
    provider_id: 39,
    provider_name: "NOW",
    logo_path: "/w.jpg",
    kind: "flatrate",
  },
] as never;

describe("toTitleDetail", () => {
  it("compone scheda, offerte lanciabili, stagioni senza speciali e prossimo episodio", () => {
    const d = toTitleDetail({
      title,
      providers,
      links: new Map([[8, { url: "https://www.netflix.com/title/70143836" }]]),
      entry: {
        status: "watching",
        rating: 9,
        season_number: 1,
        episode_number: 3,
        position_ms: null,
        position_season: null,
        position_episode: null,
      } as never,
      trailerId: "abc123",
      similar: [],
      palette: { primary: "#112233", secondary: "#445566" },
      zapp: { score: 9.1, votes: 500 },
    });
    expect(d.name).toBe("Il Trono di Spade");
    expect(d.originalName).toBe("Game of Thrones");
    expect(d.tagline).toBe("L'inverno sta arrivando");
    expect(d.genres).toEqual(["Dramma", "Sci-Fi & Fantasy"]);
    expect(d.cast[0]).toEqual({
      name: "Emilia Clarke",
      character: "Daenerys",
      profilePath: "/e.jpg",
    });
    expect(d.trailer).toEqual({ youtubeId: "abc123" });
    expect(d.providers.map((p) => [p.id, p.canLaunch, p.expected])).toEqual([
      [8, true, "avvia"],
      [39, true, "app"],
    ]);
    expect(d.providers[0].url).toBe("https://www.netflix.com/title/70143836");
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2]);
    expect(d.seasons[0].watched).toBe(3);
    expect(d.entry).toEqual({
      status: "watching",
      rating: 9,
      season: 1,
      episode: 3,
      next: { season: 1, episode: 4 },
    });
    expect(d.zappScore).toBe(9.1);
    expect(d.palette).toEqual({ primary: "#112233", secondary: "#445566" });
  });

  it("film senza entry: niente stagioni, next nullo, offerte senza link non lanciabili", () => {
    const film = {
      ...(title as Record<string, unknown>),
      id: 27205,
      media_type: "movie",
      title: "Inception",
      seasons: null,
      runtime: 148,
    } as never;
    const d = toTitleDetail({
      title: film,
      providers: [
        {
          title_id: 27205,
          media_type: "movie",
          provider_id: 8,
          provider_name: "Netflix",
          logo_path: null,
          kind: "flatrate",
        },
      ] as never,
      links: new Map(),
      entry: null,
      trailerId: null,
      similar: [],
      palette: null,
      zapp: null,
    });
    expect(d.seasons).toEqual([]);
    expect(d.entry).toBeNull();
    expect(d.runtimeMin).toBe(148);
    expect(d.providers[0].canLaunch).toBe(false);
    expect(d.trailer).toBeNull();
  });
});
