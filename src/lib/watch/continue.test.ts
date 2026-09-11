import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tmdb/client", () => ({
  getProviderList: async () => [
    { provider_id: 119, provider_name: "Prime Video", logo_path: "/prime.png" },
  ],
  getTitleImages: async () => ({ backdrops: [] }),
  getSeason: async () => ({
    episodes: [
      { episode_number: 1, name: "Primo", runtime: 48 },
      { episode_number: 2, name: "Secondo", runtime: 52 },
    ],
  }),
}));
import { getContinueItems } from "./continue";
import type { EntryWithTitle } from "./queries";

const entry = {
  id: "entry",
  title_id: 42,
  media_type: "tv",
  season_number: 1,
  episode_number: 1,
  position_ms: 1122000,
  position_duration_ms: 2886000,
  position_season: 1,
  position_episode: 1,
  title: {
    title: "Serie",
    runtime: 99,
    backdrop_path: null,
    title_providers: [],
    seasons: [{ season_number: 1, episode_count: 8, air_date: "2020-01-01" }],
  },
} as unknown as EntryWithTitle;

describe("misure della linea Continua a guardare", () => {
  it("mantiene posizione e durata esatte dopo la fine della sessione live", async () => {
    const [item] = await getContinueItems([entry]);
    expect(item).toMatchObject({
      shownSeason: 1,
      shownEpisode: 1,
      resumePositionMs: 1122000,
      resumeDurationMs: 2886000,
    });
  });
  it("non trasferisce la durata salvata sull'episodio nuovo", async () => {
    const [item] = await getContinueItems(
      [entry],
      [
        {
          titleId: 42,
          mediaType: "tv",
          seasonNumber: 1,
          episodeNumber: 2,
          state: "paused",
          positionMs: 20000,
          durationMs: 3100000,
          at: "2026-09-10T12:00:00Z",
        },
      ],
    );
    expect(item).toMatchObject({
      shownEpisode: 2,
      resumePositionMs: null,
      resumeDurationMs: null,
    });
  });
  it("non sostituisce la durata sconosciuta con il runtime generico della serie", async () => {
    const [item] = await getContinueItems([{ ...entry, position_duration_ms: null }]);
    expect(item).toMatchObject({ resumePositionMs: 1122000, resumeDurationMs: null });
  });
});

describe("piattaforma effettiva della visione", () => {
  const offered = {
    ...entry,
    title: {
      ...entry.title,
      id: 42,
      media_type: "tv",
      title_provider_links: [],
      title_providers: [
        {
          provider_id: 8,
          provider_name: "Netflix",
          logo_path: "/netflix.png",
          kind: "flatrate",
        },
        {
          provider_id: 119,
          provider_name: "Prime Video",
          logo_path: "/prime.png",
          kind: "flatrate",
        },
      ],
    },
  } as unknown as EntryWithTitle;
  it("usa l'ultima piattaforma registrata, non la prima offerta TMDB", async () => {
    const [item] = await getContinueItems(
      [offered],
      [],
      [{ titleId: 42, mediaType: "tv", providerId: 119 }],
    );
    expect(item).toMatchObject({
      providerId: 119,
      providerName: "Prime Video",
      providerRecorded: true,
    });
    expect(item.providerLogoUrl).toContain("/prime.png");
    expect(item.providerUrl).toContain("/119");
  });
  it("mantiene il logo quando il titolo non e' piu nelle offerte della piattaforma", async () => {
    const [item] = await getContinueItems(
      [entry],
      [],
      [{ titleId: 42, mediaType: "tv", providerId: 119 }],
    );
    expect(item.providerLogoUrl).toContain("/prime.png");
    expect(item.providerName).toBe("Prime Video");
  });
  it("senza una visione registrata non presenta un'offerta come piattaforma guardata", async () => {
    const [item] = await getContinueItems([offered]);
    expect(item.providerRecorded).toBe(false);
  });
  it("la visione in corso prevale sulla piattaforma precedente", async () => {
    const [item] = await getContinueItems([offered], [{
      titleId: 42, mediaType: "tv", providerId: 119, seasonNumber: 1,
      episodeNumber: 1, state: "playing", positionMs: 1000,
      durationMs: 2886000, at: "2026-09-10T12:00:00Z",
    }], [{ titleId: 42, mediaType: "tv", providerId: 8 }]);
    expect(item).toMatchObject({ providerId: 119, providerRecorded: true });
  });
  it("non trasferisce la piattaforma tra film e serie con lo stesso id", async () => {
    const [item] = await getContinueItems([offered], [], [
      { titleId: 42, mediaType: "movie", providerId: 119 },
    ]);
    expect(item.providerRecorded).toBe(false);
  });
});
