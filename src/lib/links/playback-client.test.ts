import { expect, it, vi } from "vitest";
import { createPlaybackPreparer, requestPreparedPlayback } from "./playback-client";

it("prepara al massimo due target insieme e riusa il risultato", async () => {
  const releases: (() => void)[] = [];
  let active = 0;
  let peak = 0;
  const fetcher = vi.fn(async (href: string) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return `${href}/ready`;
  });
  const prep = createPlaybackPreparer({ fetcher, concurrency: 2, max: 64, ttlMs: 300_000 });
  const a = prep.prepare("/play/tv/1/8?season=1&episode=1");
  const b = prep.prepare("/play/tv/1/8?season=1&episode=2");
  const c = prep.prepare("/play/tv/1/8?season=1&episode=3");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  releases.splice(0).forEach((release) => release());
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  releases.splice(0).forEach((release) => release());
  await Promise.all([a, b, c]);
  expect(peak).toBe(2);
  expect(await prep.prepare("/play/tv/1/8?season=1&episode=1")).toContain("/ready");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("libera lo slot anche se il fetcher fallisce subito", async () => {
  const fetcher = vi
    .fn<(href: string) => Promise<string | null>>()
    .mockImplementationOnce(() => {
      throw new Error("rete");
    })
    .mockResolvedValueOnce("https://www.netflix.com/watch/2");
  const prep = createPlaybackPreparer({ fetcher, concurrency: 1 });
  expect(await prep.prepare("/play/movie/1/8")).toBeNull();
  expect(await prep.prepare("/play/movie/2/8")).toBe("https://www.netflix.com/watch/2");
});

it("non avvia la coda in background e riprende quando torna visibile", async () => {
  let visible = false;
  const fetcher = vi.fn(async () => "https://www.netflix.com/watch/3");
  const prep = createPlaybackPreparer({
    fetcher,
    concurrency: 1,
    canStart: () => visible,
  });
  const result = prep.prepare("/play/movie/3/8");
  await Promise.resolve();
  expect(fetcher).not.toHaveBeenCalled();
  visible = true;
  prep.resume();
  expect(await result).toBe("https://www.netflix.com/watch/3");
});

it("interrompe una preparazione HTTP bloccata e libera il timer", async () => {
  vi.useFakeTimers();
  const clear = vi.spyOn(globalThis, "clearTimeout");
  const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
  );
  const result = requestPreparedPlayback("/play/movie/3/8", {
    origin: "https://zapp.test",
    timeoutMs: 12_000,
    fetcher,
  });
  await vi.advanceTimersByTimeAsync(12_000);
  await expect(result).resolves.toBeNull();
  expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(clear).toHaveBeenCalled();
  vi.useRealTimers();
});
