import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  device: { data: { id: "device-test" }, error: null as unknown },
  match: vi.fn(),
  title: vi.fn(),
  season: vi.fn(),
  tv: vi.fn(),
  filters: [] as unknown[][],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("@/lib/scrobble/match", () => ({ matchTitle: mocks.match }));
vi.mock("@/lib/tmdb/client", () => ({ getSeason: mocks.season, getTv: mocks.tv }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: mocks.title }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from(table: string) {
      const query = {
        select: () => query,
        insert: async () => ({ data: null, error: null }),
        eq: (...args: unknown[]) => {
          mocks.filters.push([table, ...args]);
          return query;
        },
        is: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () =>
          table === "devices" ? mocks.device : { data: null, error: null },
      };
      return query;
    },
  }),
}));
import { POST } from "@/app/api/scrobble/route";

const raw = (id: string) => ({
  id,
  at: "2026-09-09T12:00:00Z",
  site: "netflix",
  state: "paused",
  url: "https://www.netflix.com/watch/123",
  title: null,
  artist: null,
  album: null,
  titleText: "DarkE5",
  showText: "Dark",
  pauseText: null,
  positionMs: 1_122_000,
  durationMs: 3_600_000,
});
async function request(events: unknown[]) {
  return POST(
    new NextRequest("https://zapp.test/api/scrobble", {
      method: "POST",
      headers: { authorization: "Bearer test-token-not-a-real-secret" },
      body: JSON.stringify({ events }),
    }),
  );
}
beforeEach(() => {
  mocks.filters = [];
  mocks.tv.mockReset().mockResolvedValue({ name: "Reacher", original_name: "Reacher" });
  mocks.season.mockReset().mockResolvedValue({
    episodes: [
      { season_number: 1, episode_number: 2, name: "Lotta in gabbia" },
      { season_number: 1, episode_number: 3, name: "Un piccolo passo" },
    ],
  });
  mocks.device = { data: { id: "device-test" }, error: null };
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { ok: true, entry_written: true }, error: null });
  mocks.match.mockReset().mockResolvedValue({ titleId: 42, mediaType: "tv" });
  mocks.title.mockReset().mockResolvedValue({
    title: {
      title: "Dark",
      poster_path: null,
      backdrop_path: null,
      seasons: [
        { season_number: 0, episode_count: 1 },
        { season_number: 1, episode_count: 8 },
      ],
    },
  });
});
describe("conferma persistente scrobble", () => {
  it("salva 18:42 e riconosce la stagione unica senza aspettare una pausa", async () => {
    const res = await request([raw("a")]);
    const body = await res.json();
    expect(body.acknowledged).toEqual(["a"]);
    expect(body.cardUrl).toBe(raw("a").url);
    expect(mocks.rpc.mock.calls[0][1].p_intent).toMatchObject({
      season: 1,
      episode: 5,
      progress: { position_ms: 1122000 },
      completed: false,
    });
  });
  it("errore SQL parziale: il lotto conferma solo la seconda scrittura", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "temporary" } });
    const body = await (await request([raw("a"), raw("b")])).json();
    expect(body.acknowledged).toEqual(["b"]);
    expect(body.applied).toBe(1);
  });
  it("errore DB nella verifica dispositivo non revoca il collegamento", async () => {
    mocks.device.error = { message: "temporary" };
    expect((await request([raw("a")])).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("TMDB temporaneamente indisponibile: nessuna falsa conferma", async () => {
    mocks.match.mockRejectedValueOnce(new Error("temporary"));
    const body = await (await request([raw("a")])).json();
    expect(body.acknowledged).toEqual([]);
    expect(body.card).toBeNull();
  });
  it("con piu' stagioni non inventa quella corrente", async () => {
    mocks.title.mockResolvedValueOnce({
      title: {
        title: "Dark",
        seasons: [
          { season_number: 1, episode_count: 8 },
          { season_number: 2, episode_count: 8 },
        ],
      },
    });
    await request([raw("a")]);
    expect(mocks.rpc.mock.calls[0][1].p_intent.season).toBeNull();
  });
});

const prime = (id: string, detail = "S4 E2 Lotta in gabbia") => ({
  ...raw(id),
  site: "prime",
  url: "https://www.primevideo.com/detail/ABC",
  titleText: "Reacher",
  showText: null,
  pauseText: detail,
  contentKey: id,
});
describe("Prime ingest", () => {
  it("risolve i numeri TMDB e isola la sessione dell'episodio", async () => {
    mocks.title.mockResolvedValue({
      title: { title: "Reacher", seasons: [{ season_number: 1, episode_count: 8 }] },
    });
    const body = await (
      await request([prime("e2"), prime("e3", "S4 E3 Un piccolo passo")])
    ).json();
    expect(body.applied).toBe(2);
    expect(body.supportedSites).toEqual(expect.arrayContaining(["netflix", "prime"]));
    expect(body.cardContentKey).toBe("e3");
    expect(mocks.rpc.mock.calls.map((c) => c[1].p_intent)).toMatchObject([
      { season: 1, episode: 2, provider_id: 119 },
      { season: 1, episode: 3 },
    ]);
    expect(mocks.filters).toContainEqual(["watch_sessions", "provider_id", 119]);
    expect(mocks.filters).toContainEqual(["watch_sessions", "season_number", 1]);
    expect(mocks.filters).toContainEqual(["watch_sessions", "episode_number", 3]);
  });
  it("non salva un episodio senza nome verificato", async () => {
    const body = await (
      await request([prime("missing", "S4 E2 Nome sconosciuto")])
    ).json();
    expect(body.applied).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rifiuta una chiave contenuto fuori limite", async () => {
    const body = await (
      await request([{ ...prime("large"), contentKey: "x".repeat(1501) }])
    ).json();
    expect(body.acknowledged).toEqual(["large"]);
    expect(mocks.match).not.toHaveBeenCalled();
  });
});

describe("Prime verifiche conservative", () => {
  it("salva il film esatto senza dettagli episodio", async () => {
    mocks.match
      .mockResolvedValueOnce({ titleId: 42, mediaType: "movie" })
      .mockResolvedValueOnce(null);
    mocks.title.mockResolvedValue({ title: { title: "Come un tuono", seasons: null } });
    const body = await (
      await request([{ ...prime("film"), titleText: "Come un tuono", pauseText: null }])
    ).json();
    expect(body.applied).toBe(1);
    expect(mocks.rpc.mock.calls[0][1].p_intent).toMatchObject({
      media_type: "movie",
      season: null,
      episode: null,
    });
  });
  it("non trasforma una serie senza dettaglio in un film omonimo", async () => {
    mocks.match
      .mockResolvedValueOnce({ titleId: 42, mediaType: "movie" })
      .mockResolvedValueOnce({ titleId: 50, mediaType: "tv" });
    mocks.title.mockResolvedValue({ title: { title: "Reacher", seasons: null } });
    const body = await (await request([{ ...prime("tv"), pauseText: null }])).json();
    expect(body.applied).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("due episodi omonimi non producono una scrittura", async () => {
    mocks.title.mockResolvedValue({
      title: { title: "Reacher", seasons: [{ season_number: 1 }, { season_number: 2 }] },
    });
    const body = await (await request([prime("ambiguous")])).json();
    expect(body.applied).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("un errore TMDB durante la verifica episodio resta da ritentare", async () => {
    mocks.title.mockResolvedValue({
      title: { title: "Reacher", seasons: [{ season_number: 1 }] },
    });
    mocks.season.mockRejectedValueOnce(new Error("temporary season"));
    const body = await (await request([prime("retry")])).json();
    expect(body.acknowledged).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("la card resta dell'ultimo evento scritto anche se il successivo non scrive entry", async () => {
    mocks.title.mockResolvedValue({
      title: { title: "Reacher", seasons: [{ season_number: 1 }] },
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: true, entry_written: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, entry_written: false }, error: null });
    const body = await (
      await request([prime("e2"), prime("e3", "S4 E3 Un piccolo passo")])
    ).json();
    expect(body.cardContentKey).toBe("e2");
    expect(body.card.episode).toBe(2);
  });
});

describe("Prime film: omonimia reale contro semplice somiglianza", () => {
  it("salva Spider-Man Homecoming anche se la ricerca TV trova Spider-Man", async () => {
    mocks.match
      .mockResolvedValueOnce({ titleId: 315635, mediaType: "movie" })
      .mockResolvedValueOnce({ titleId: 888, mediaType: "tv" });
    mocks.title.mockResolvedValue({
      title: {
        title: "Spider-Man: Homecoming",
        original_title: "Spider-Man: Homecoming",
        seasons: null,
      },
    });
    mocks.tv.mockResolvedValue({
      name: "Spider-Man - L'Uomo Ragno",
      original_name: "Spider-Man",
    });
    const body = await (
      await request([
        { ...prime("homecoming"), titleText: "Spider-Man: Homecoming", pauseText: null },
      ])
    ).json();
    expect(body.applied).toBe(1);
    expect(body.cardContentKey).toBe("homecoming");
    expect(mocks.rpc.mock.calls[0][1].p_intent).toMatchObject({
      title_id: 315635,
      media_type: "movie",
      provider_id: 119,
    });
  });
  it("un errore di rete sul candidato TV conserva l'evento per un nuovo tentativo", async () => {
    mocks.match
      .mockResolvedValueOnce({ titleId: 42, mediaType: "movie" })
      .mockResolvedValueOnce({ titleId: 50, mediaType: "tv" });
    mocks.title.mockResolvedValue({ title: { title: "Reacher", seasons: null } });
    mocks.tv.mockRejectedValueOnce(new Error("temporary TV lookup"));
    const body = await (
      await request([{ ...prime("retry-tv"), pauseText: null }])
    ).json();
    expect(body.acknowledged).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
