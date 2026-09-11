import { describe, expect, it, vi } from "vitest";
import { createPlaybackCache, playbackKey } from "./playback-cache";

describe("cache dei link Play", () => {
  it("isola provider, stagione ed episodio", () => {
    expect(playbackKey({ mediaType: "tv", titleId: 42, providerId: 8, season: 1, episode: 2 }))
      .not.toBe(playbackKey({ mediaType: "tv", titleId: 42, providerId: 8, season: 1, episode: 3 }));
    expect(playbackKey({ mediaType: "tv", titleId: 42, providerId: 8, season: 1, episode: 2 }))
      .not.toBe(playbackKey({ mediaType: "tv", titleId: 42, providerId: 119, season: 1, episode: 2 }));
  });

  it("deduplica richieste concorrenti e conserva solo risultati positivi", async () => {
    const cache = createPlaybackCache({ max: 4, ttlMs: 1_000 });
    const load = vi.fn(async () => "https://www.netflix.com/watch/123");
    const target = { mediaType: "tv" as const, titleId: 42, providerId: 8, season: 1, episode: 2 };
    expect(await Promise.all([cache.get(target, load), cache.get(target, load)])).toEqual([
      "https://www.netflix.com/watch/123",
      "https://www.netflix.com/watch/123",
    ]);
    expect(load).toHaveBeenCalledTimes(1);

    const miss = vi.fn(async () => null);
    const other = { ...target, episode: 3 };
    await cache.get(other, miss);
    await cache.get(other, miss);
    expect(miss).toHaveBeenCalledTimes(2);
  });

  it("scade e limita i risultati in memoria", async () => {
    let now = 0;
    const cache = createPlaybackCache({ max: 1, ttlMs: 10, now: () => now });
    const load = vi.fn(async (target: { episode: number | null }) => `https://example.com/${target.episode}`);
    const base = { mediaType: "tv" as const, titleId: 42, providerId: 8, season: 1 };
    await cache.get({ ...base, episode: 1 }, load);
    await cache.get({ ...base, episode: 2 }, load);
    await cache.get({ ...base, episode: 1 }, load);
    now = 20;
    await cache.get({ ...base, episode: 1 }, load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
