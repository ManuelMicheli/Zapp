import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  season: vi.fn(),
  filters: [] as unknown[][],
  /** Un membro solo, col consenso `scrobble` attivo: il caso normale. */
  membri: [{ user_id: "user-test" }] as unknown[],
  consensi: [{ user_id: "user-test" }] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("@/lib/scrobble/match", () => ({
  matchTitle: async () => ({ titleId: 100088, mediaType: "tv" }),
}));
vi.mock("@/lib/tmdb/client", () => ({
  getSeason: mocks.season,
  getTv: async () => ({ name: "The Last of Us" }),
}));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async () => ({
    title: { title: "The Last of Us", seasons: [{ season_number: 1, episode_count: 9 }] },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from(table: string) {
      const q = {
        select: () => q,
        insert: async () => ({ error: null }),
        eq: (...v: unknown[]) => {
          mocks.filters.push([table, ...v]);
          return q;
        },
        is: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        then: (risolvi: (v: unknown) => unknown) =>
          risolvi(
            table === "device_members"
              ? { data: mocks.membri, error: null }
              : table === "user_consents"
                ? { data: mocks.consensi, error: null }
                : { data: [], error: null },
          ),
        maybeSingle: async () => ({
          data: table === "devices" ? { id: "device-test" } : null,
          error: null,
        }),
      };
      return q;
    },
  }),
}));
import { POST } from "@/app/api/scrobble/route";
beforeEach(() => {
  mocks.filters = [];
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { ok: true, entry_written: true }, error: null });
  mocks.season.mockReset().mockResolvedValue({
    episodes: [
      { season_number: 1, episode_number: 2, name: "Gli infetti" },
      { season_number: 1, episode_number: 3, name: "Molto, molto tempo" },
    ],
  });
});
const event = (episode: number) => ({
  id: `now-${episode}`,
  at: "2026-09-10T15:38:00Z",
  site: "now",
  state: "paused",
  url:
    episode === 2
      ? "https://www.nowtv.it/watch/playback/vod/_/R_160716_HD"
      : "https://www.nowtv.it/watch/playback/vod/R_160702/R_160702_HD",
  title: null,
  artist: null,
  album: null,
  titleText: "The Last of Us",
  showText: null,
  pauseText: episode === 2 ? "S1 E2: Gli infetti" : "S1 E3: Molto, molto tempo",
  contentKey: `now-${episode}`,
  positionMs: 99000,
  durationMs: 4373000,
});
async function request(events: unknown[]) {
  return (
    await POST(
      new NextRequest("https://zapp.test/api/scrobble", {
        method: "POST",
        headers: { authorization: "Bearer test-token-not-a-real-secret" },
        body: JSON.stringify({ events }),
      }),
    )
  ).json();
}
it("NOW verifica gli episodi e salva provider 39 e minuto contenuto, isolando le sessioni", async () => {
  const body = await request([event(2), event(3)]);
  expect(body.supportedSites).toContain("now");
  expect(body.applied).toBe(2);
  expect(body.cardContentKey).toBe("now-3");
  expect(mocks.rpc.mock.calls.map((c) => c[1].p_intent)).toMatchObject([
    { provider_id: 39, season: 1, episode: 2, progress: { position_ms: 99000 } },
    { provider_id: 39, season: 1, episode: 3, progress: { position_ms: 99000 } },
  ]);
  expect(mocks.filters).toContainEqual(["watch_sessions", "provider_id", 39]);
  expect(mocks.filters).toContainEqual(["watch_sessions", "episode_number", 3]);
});
it("NOW non scrive se il nome episodio non è verificato o se la URL è una diretta", async () => {
  mocks.season.mockResolvedValue({ episodes: [] });
  expect((await request([event(2)])).applied).toBe(0);
  expect(
    (
      await request([
        { ...event(3), url: "https://www.nowtv.it/watch/playback/live/channel" },
      ])
    ).applied,
  ).toBe(0);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
