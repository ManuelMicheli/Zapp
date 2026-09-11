export interface PlaybackTarget {
  mediaType: "movie" | "tv";
  titleId: number;
  providerId: number;
  season: number | null;
  episode: number | null;
}

export function playbackKey(target: PlaybackTarget): string {
  return [
    target.mediaType,
    target.titleId,
    target.providerId,
    target.season ?? "-",
    target.episode ?? "-",
  ].join(":");
}

export function createPlaybackCache(options: {
  max: number;
  ttlMs: number;
  now?: () => number;
}) {
  const positive = new Map<string, { url: string; expiresAt: number }>();
  const inflight = new Map<string, Promise<string | null>>();
  const now = options.now ?? Date.now;

  function remember(key: string, url: string) {
    positive.delete(key);
    positive.set(key, { url, expiresAt: now() + options.ttlMs });
    while (positive.size > options.max) {
      const oldest = positive.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      positive.delete(oldest);
    }
  }

  return {
    async get(
      target: PlaybackTarget,
      load: (target: PlaybackTarget) => Promise<string | null>,
    ): Promise<string | null> {
      const key = playbackKey(target);
      const hit = positive.get(key);
      if (hit && hit.expiresAt > now()) {
        positive.delete(key);
        positive.set(key, hit);
        return hit.url;
      }
      if (hit) positive.delete(key);
      const running = inflight.get(key);
      if (running) return running;
      if (inflight.size >= options.max) return null;
      const request = load(target)
        .then((url) => {
          if (url) remember(key, url);
          return url;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, request);
      return request;
    },
  };
}
