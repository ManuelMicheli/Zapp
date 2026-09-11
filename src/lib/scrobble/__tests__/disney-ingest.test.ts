import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  season: vi.fn(),
  title: "The Last of Us",
  filters: [] as unknown[][],
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
    title: { title: mocks.title, seasons: [{ season_number: 1, episode_count: 9 }] },
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
        order: () => q,
        limit: () => q,
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
  mocks.title = "The Last of Us";
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
  id: `disney-${episode}`,
  at: "2026-09-10T15:38:00Z",
  site: "disney",
  state: "paused",
  url:
    episode === 2
      ? "https://www.disneyplus.com/it-it/play/bbd235c0-0835-4f0f-875f-7bbc8bf4bd79"
      : "https://www.disneyplus.com/it-it/play/73acc85e-c36e-491d-adaa-0a32d4dca418",
  title: null,
  artist: null,
  album: null,
  titleText: "The Last of Us",
  showText: null,
  pauseText: episode === 2 ? "S1:E2 Gli infetti" : "S1:E3 Molto, molto tempo",
  contentKey: `disney-${episode}`,
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
it("Disney verifica gli episodi e salva provider 337 e minuto contenuto, isolando le sessioni", async () => {
  const body = await request([event(2), event(3)]);
  expect(body.supportedSites).toContain("disney");
  expect(body.applied).toBe(2);
  expect(body.cardContentKey).toBe("disney-3");
  expect(mocks.rpc.mock.calls.map((c) => c[1].p_intent)).toMatchObject([
    { provider_id: 337, season: 1, episode: 2, progress: { position_ms: 99000 } },
    { provider_id: 337, season: 1, episode: 3, progress: { position_ms: 99000 } },
  ]);
  expect(mocks.filters).toContainEqual(["watch_sessions", "provider_id", 337]);
  expect(mocks.filters).toContainEqual(["watch_sessions", "episode_number", 3]);
});
it("Disney non scrive se il nome episodio non è verificato o se la URL è una diretta", async () => {
  mocks.season.mockResolvedValue({ episodes: [] });
  expect((await request([event(2)])).applied).toBe(0);
  expect(
    (await request([{ ...event(3), url: "https://www.disneyplus.com/it-it/home" }]))
      .applied,
  ).toBe(0);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("Disney usa l alias verificato Made in Korea e i soli episodi mappati quando TMDB ha nomi generici", async () => {
  mocks.title = "??? ? ???";
  mocks.season.mockResolvedValue({
    episodes: [{ season_number: 1, episode_number: 2, name: "Episodio 2" }],
  });
  const body = await request([
    { ...event(2), titleText: "Made in Korea", pauseText: "S1:E2 Le unghie del cane" },
  ]);
  expect(body.applied).toBe(1);
  expect(mocks.rpc.mock.calls[0][1].p_intent).toMatchObject({
    title_id: 246473,
    season: 1,
    episode: 2,
    provider_id: 337,
  });
  mocks.rpc.mockClear();
  expect(
    (
      await request([
        {
          ...event(2),
          titleText: "Made in Korea",
          pauseText: "S1:E2 Nome non verificato",
        },
      ])
    ).applied,
  ).toBe(0);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
