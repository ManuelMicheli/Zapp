import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  viewer: vi.fn(),
  limit: vi.fn(),
  title: vi.fn(),
  play: vi.fn(),
  fallback: vi.fn(),
  prepared: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: m.viewer }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.limit }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: m.title }));
vi.mock("./playback-resolve", () => ({ resolvePlayback: m.play }));
vi.mock("./resolve", () => ({ resolveProviderLink: m.fallback }));
vi.mock("./playback-prepare", () => ({ getPreparedPlayback: m.prepared }));
import { GET, POST } from "@/app/play/[mediaType]/[id]/[providerId]/route";
const invoke = (query = "?season=2&episode=3") =>
  GET(new Request("https://zapp.test/play/tv/42/8" + query), {
    params: Promise.resolve({ mediaType: "tv", id: "42", providerId: "8" }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.viewer.mockResolvedValue({ id: "me" });
  m.limit.mockResolvedValue(true);
  m.title.mockResolvedValue({
    title: { id: 42, media_type: "tv", title: "Serie", original_title: null },
  });
  m.play.mockResolvedValue("https://www.netflix.com/watch/123");
  m.prepared.mockResolvedValue("https://www.netflix.com/watch/123");
});
it("reindirizza dal link preparato senza rileggere metadata", async () => {
  const r = await invoke();
  expect(r.headers.get("location")).toBe("https://www.netflix.com/watch/123");
  expect(m.title).not.toHaveBeenCalled();
  expect(m.play).not.toHaveBeenCalled();
});
it("prepara JSON privato dopo autenticazione e rate limit", async () => {
  const r = await POST(new Request("https://zapp.test/play/tv/42/8?season=2&episode=3", { method: "POST" }), {
    params: Promise.resolve({ mediaType: "tv", id: "42", providerId: "8" }),
  });
  expect(await r.json()).toEqual({ href: "https://www.netflix.com/watch/123" });
  expect(r.headers.get("cache-control")).toContain("private");
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(m.limit).toHaveBeenCalledWith("play-prepare:me", 60, 60);
});
it.each(["39", "337"])("accetta il provider player verificato %s", async (providerId) => {
  const r = await GET(
    new Request(`https://zapp.test/play/tv/42/${providerId}?season=2&episode=3`),
    { params: Promise.resolve({ mediaType: "tv", id: "42", providerId }) },
  );
  expect(r.status).toBe(302);
});
it("senza sessione non interroga il catalogo", async () => {
  m.viewer.mockResolvedValue(null);
  expect((await invoke()).status).toBe(404);
  expect(m.title).not.toHaveBeenCalled();
});
it("usa il target mostrato e reindirizza al player esatto", async () => {
  const r = await invoke();
  expect(r.headers.get("location")).toBe("https://www.netflix.com/watch/123");
  expect(m.prepared).toHaveBeenCalledWith({
    mediaType: "tv",
    titleId: 42,
    providerId: 8,
    season: 2,
    episode: 3,
  });
});
it("limita le richieste prima di consultare i servizi", async () => {
  m.limit.mockResolvedValue(false);
  expect((await invoke()).status).toBe(429);
  expect(m.title).not.toHaveBeenCalled();
});
it.each(["?season=0&episode=3", "?season=2&episode=-1", "?season=2&episode=1.5", ""])(
  "respinge target invalido %s",
  async (q) => {
    expect((await invoke(q)).status).toBe(404);
    expect(m.title).not.toHaveBeenCalled();
  },
);
it("su catalogo incompleto conserva il link del titolo", async () => {
  m.prepared.mockResolvedValue(null);
  m.fallback.mockResolvedValue({ url: "https://www.netflix.com/title/456" });
  expect((await invoke()).headers.get("location")).toBe(
    "https://www.netflix.com/title/456",
  );
});
it("blocca un redirect non pubblico anche nel ripiego", async () => {
  m.prepared.mockResolvedValue(null);
  m.fallback.mockResolvedValue({ url: "https://127.0.0.1/private" });
  expect((await invoke()).status).toBe(404);
});
it("non prepara e non conserva un ripiego generico", async () => {
  m.prepared.mockResolvedValue(null);
  const r = await POST(new Request("https://zapp.test/play/tv/42/8?season=2&episode=3", { method: "POST" }), {
    params: Promise.resolve({ mediaType: "tv", id: "42", providerId: "8" }),
  });
  expect(r.status).toBe(404);
  expect(m.title).not.toHaveBeenCalled();
  expect(m.fallback).not.toHaveBeenCalled();
});
