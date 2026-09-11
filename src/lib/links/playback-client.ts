const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createPlaybackPreparer(options: {
  fetcher: (href: string) => Promise<string | null>;
  concurrency?: number;
  max?: number;
  ttlMs?: number;
  now?: () => number;
  canStart?: () => boolean;
}) {
  const concurrency = options.concurrency ?? 2;
  const max = options.max ?? 64;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;
  const canStart =
    options.canStart ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const values = new Map<string, { href: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string | null>>();
  const queue: { href: string; run: () => void }[] = [];
  let active = 0;

  function drain() {
    while (canStart() && active < concurrency && queue.length) {
      active++;
      queue.shift()!.run();
    }
  }

  function remember(key: string, href: string) {
    values.delete(key);
    values.set(key, { href, expiresAt: now() + ttlMs });
    while (values.size > max) values.delete(values.keys().next().value!);
  }

  return {
    resume: drain,
    prepare(href: string): Promise<string | null> {
      const hit = values.get(href);
      if (hit && hit.expiresAt > now()) return Promise.resolve(hit.href);
      if (hit) values.delete(href);
      const current = pending.get(href);
      if (current) return current;
      if (pending.size >= max) return Promise.resolve(null);
      const promise = new Promise<string | null>((resolve) => {
        queue.push({
          href,
          run: () => {
            void Promise.resolve()
              .then(() => options.fetcher(href))
              .then((prepared) => {
                if (prepared) remember(href, prepared);
                resolve(prepared);
              })
              .catch(() => resolve(null))
              .finally(() => {
                pending.delete(href);
                active--;
                drain();
              });
          },
        });
        drain();
      });
      pending.set(href, promise);
      return promise;
    },
  };
}

export async function requestPreparedPlayback(
  href: string,
  options: {
    origin?: string;
    timeoutMs?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<string | null> {
  const url = new URL(href, options.origin ?? window.location.origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { href?: unknown };
    return typeof body.href === "string" ? body.href : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const playbackPreparer = createPlaybackPreparer({ fetcher: requestPreparedPlayback });

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") playbackPreparer.resume();
  });
}
