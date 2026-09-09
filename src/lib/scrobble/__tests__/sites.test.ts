import { describe, expect, it } from "vitest";
import fixtures from "@/lib/scrobble/__fixtures__/netflix.json";
import {
  isWatchUrl,
  PROVIDER_ID_BY_SITE,
  parseEvent,
  siteFromUrl,
  watchIdFromUrl,
} from "@/lib/scrobble/sites";
import type { RawEvent } from "@/lib/scrobble/types";

describe("siteFromUrl", () => {
  it("riconosce i quattro domini", () => {
    expect(siteFromUrl("https://www.netflix.com/watch/8123")).toBe("netflix");
    expect(siteFromUrl("https://www.primevideo.com/detail/x")).toBe("prime");
    expect(siteFromUrl("https://www.amazon.it/gp/video/detail/x")).toBe("prime");
    expect(siteFromUrl("https://www.disneyplus.com/it-it/video/x")).toBe("disney");
    expect(siteFromUrl("https://www.nowtv.it/guarda/x")).toBe("now");
  });

  it("non riconosce nient'altro", () => {
    expect(siteFromUrl("https://www.youtube.com/watch?v=x")).toBeNull();
    expect(siteFromUrl("non-un-url")).toBeNull();
  });
});

describe("PROVIDER_ID_BY_SITE", () => {
  it("usa gli id TMDB di config.ts", () => {
    expect(PROVIDER_ID_BY_SITE).toEqual({ netflix: 8, prime: 119, disney: 337, now: 39 });
  });
});

describe("isWatchUrl / watchIdFromUrl", () => {
  it("Netflix: solo dentro /watch/, id = quello nel percorso", () => {
    expect(isWatchUrl("netflix", "https://www.netflix.com/watch/70232180")).toBe(true);
    expect(
      watchIdFromUrl("netflix", "https://www.netflix.com/watch/70232180?trackId=1"),
    ).toBe("70232180");
    expect(isWatchUrl("netflix", "https://www.netflix.com/browse")).toBe(false);
    expect(isWatchUrl("netflix", "https://www.netflix.com/browse/genre/34399")).toBe(
      false,
    );
    expect(watchIdFromUrl("netflix", "https://www.netflix.com/browse")).toBeNull();
  });

  it("un url non valido non e' mai una pagina di riproduzione", () => {
    expect(isWatchUrl("netflix", "non-un-url")).toBe(false);
    expect(watchIdFromUrl("netflix", "non-un-url")).toBeNull();
  });
});

/**
 * Da una riga della sonda a un `RawEvent` Netflix. Non e' un mapping 1:1 dei
 * selettori: la riga con i comandi del player nascosti (nessun selettore per
 * il titolo) ha comunque un `expected.title` valorizzato, perche' nel prodotto
 * vero e' **l'estensione** — non questo modulo, che resta puro e senza stato —
 * a ricordare e a rimandare l'ultimo titolo noto per quell'id `/watch/`. Qui
 * si simula esattamente quel comportamento, come indicato dal task.
 */
function eventFromFixture(row: (typeof fixtures)[number]): RawEvent {
  const selettori = (row.selettori ?? {}) as Record<string, string>;
  const uiaTitoli = (row.uiaTitoli ?? {}) as Record<string, string>;
  const expected = row.expected as { ignora: boolean; title?: string };

  let titleText: string | null = selettori['[data-uia="video-title"]'] ?? null;
  let showText: string | null = selettori['[data-uia="video-title"] h4'] ?? null;
  const pauseText = uiaTitoli["pause-ad-title-display"] ?? null;

  if (!titleText && !showText && !pauseText && !expected.ignora && expected.title) {
    // L'estensione ha rimandato l'ultimo titolo noto per questo id /watch/.
    titleText = expected.title;
    showText = null;
  }

  return {
    id: "x",
    at: row.at,
    site: "netflix",
    state: row.paused === null ? "stopped" : row.paused ? "paused" : "playing",
    url: row.url,
    title: null,
    artist: null,
    album: null,
    titleText,
    showText,
    pauseText,
    positionMs:
      row.currentTime === null ? null : Math.round(Number(row.currentTime) * 1000),
    durationMs: row.duration === null ? null : Math.round(Number(row.duration) * 1000),
  };
}

describe("parseEvent sulle fixture vere di Netflix", () => {
  for (const row of fixtures) {
    const nota = row.nota.slice(0, 60);
    const expected = row.expected as {
      ignora: boolean;
      netflixId?: string;
      kind?: string;
      title?: string;
      season?: number | null;
      episode?: number | null;
      episodeName?: string | null;
    };

    it(nota, () => {
      const event = eventFromFixture(row);

      if (expected.ignora) {
        expect(parseEvent(event)).toBeNull();
        return;
      }

      const parsed = parseEvent(event);
      expect(parsed).not.toBeNull();
      expect(parsed).toMatchObject({
        kind: expected.kind,
        title: expected.title,
        season: expected.season ?? null,
        episode: expected.episode ?? null,
        episodeName: expected.episodeName ?? null,
      });
      // L'id nell'url e' quello atteso dalla riga (dove la fixture lo porta).
      if (expected.netflixId) {
        expect(watchIdFromUrl("netflix", row.url)).toBe(expected.netflixId);
      }
    });
  }
});

describe("parseEvent, casi oltre le fixture", () => {
  const base: RawEvent = {
    id: "x",
    at: "2026-09-09T00:00:00.000Z",
    site: "netflix",
    state: "playing",
    url: "https://www.netflix.com/watch/1",
    title: null,
    artist: null,
    album: null,
    titleText: null,
    showText: null,
    pauseText: null,
    positionMs: 1000,
    durationMs: 2000,
  };

  it("fuori da /watch/ non si manda mai niente, anche con un titolo noto", () => {
    const event: RawEvent = {
      ...base,
      url: "https://www.netflix.com/browse",
      titleText: "Quasi amici",
    };
    expect(parseEvent(event)).toBeNull();
  });

  it("un url che non appartiene a nessun sito riconosciuto non manda niente", () => {
    const event: RawEvent = { ...base, url: "non-un-url", titleText: "Quasi amici" };
    expect(parseEvent(event)).toBeNull();
  });

  it("Prime/Disney+/NOW: senza sonda si usa la mediaSession standard", () => {
    const event: RawEvent = {
      ...base,
      site: "prime",
      url: "https://www.primevideo.com/detail/abc123",
      artist: "The Boys",
      title: "2x04 - Lo stato delle cose",
    };
    expect(parseEvent(event)).toMatchObject({
      kind: "tv",
      title: "The Boys",
      episode: 4,
    });
  });

  it("Disney+ senza titolo noto non manda niente", () => {
    const event: RawEvent = {
      ...base,
      site: "disney",
      url: "https://www.disneyplus.com/play/abc-123",
    };
    expect(parseEvent(event)).toBeNull();
  });
});
