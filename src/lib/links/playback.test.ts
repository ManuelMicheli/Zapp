import { describe, expect, it } from "vitest";
import { disneyPlaybackHref, playbackHref, pickPlaybackUrl } from "./playback";

const offer = (url: string, provider = 8) => ({
  deeplinkURL: url,
  package: { packageId: provider },
  monetizationType: "FLATRATE",
});
describe("Play dalla card", () => {
  it("porta stagione ed episodio mostrati, non quelli completati", () => {
    expect(playbackHref("tv", 42, 119, 2, 3, "/vecchio")).toBe(
      "/play/tv/42/119?season=2&episode=3",
    );
  });
  it("mantiene il comportamento delle altre piattaforme", () => {
    expect(playbackHref("tv", 42, 350, 2, 3, "/apple")).toBe("/apple");
  });
  it("non inventa episodi quando la stagione e' sconosciuta", () => {
    expect(playbackHref("tv", 42, 8, null, 3, "/serie")).toBe("/serie");
  });
  it("anche i film usano l'apertura nel player", () => {
    expect(playbackHref("movie", 42, 8, null, null, "/film")).toBe("/play/movie/42/8");
  });
  it("prepara anche Disney+ e NOW senza cambiare il target mostrato", () => {
    expect(playbackHref("tv", 42, 337, 2, 3, "/serie")).toBe(
      "/play/tv/42/337?season=2&episode=3",
    );
    expect(playbackHref("tv", 42, 39, 2, 3, "/serie")).toBe(
      "/play/tv/42/39?season=2&episode=3",
    );
  });
});
describe("URL esatto di riproduzione", () => {
  it("preferisce l'id player Netflix al link generico della serie", () => {
    expect(
      pickPlaybackUrl(
        [
          {
            ...offer("https://www.netflix.com/watch/80077369?trackId=123"),
            standardWebURL: "https://www.netflix.com/title/80057281",
          },
        ],
        8,
      ),
    ).toBe("https://www.netflix.com/watch/80077369");
    expect(
      pickPlaybackUrl([offer("https://www.netflix.com/title/80057281")], 8),
    ).toBeNull();
  });
  it("mantiene il GTI del singolo episodio Prime nel link watch", () => {
    const url =
      "https://app.primevideo.com/watch?gti=amzn1.dv.gti.77650506-dee2-4b53-a87e-189f8ed5cd9c";
    expect(pickPlaybackUrl([offer(url, 119)], 119)).toBe(url);
  });
  it("accetta soltanto il player UUID ufficiale Disney+", () => {
    const url = "https://www.disneyplus.com/play/8bb20e2f-01c4-4748-929b-61e6da32880b";
    expect(pickPlaybackUrl([offer(url, 337)], 337)).toBe(
      "https://www.disneyplus.com/it-it/play/8bb20e2f-01c4-4748-929b-61e6da32880b",
    );
    expect(
      pickPlaybackUrl(
        [offer("https://www.disneyplus.com/browse/entity-8bb20e2f-01c4-4748-929b-61e6da32880b", 337)],
        337,
      ),
    ).toBeNull();
  });
  it.each([
    ["tv S1E2", "bbd235c0-0835-4f0f-875f-7bbc8bf4bd79"],
    ["tv S1E3", "73acc85e-c36e-491d-adaa-0a32d4dca418"],
    ["film", "d285316b-e1ea-4b50-933a-bb5fd13549c1"],
  ])("mantiene l'identita Disney osservata per %s", (_label, uuid) => {
    expect(
      pickPlaybackUrl([offer(`https://www.disneyplus.com/play/${uuid}`, 337)], 337),
    ).toBe(`https://www.disneyplus.com/it-it/play/${uuid}`);
  });
  it("accetta soltanto le due forme episodio osservate di NOW", () => {
    const short = "https://www.nowtv.it/watch/asset/the-last-of-us/R_160702_HD";
    const episode =
      "https://www.nowtv.it/watch/home/asset/the-last-of-us/season-1/seasons/1/episodes/gli-infetti/R_160716_HD";
    expect(pickPlaybackUrl([offer(short, 39)], 39)).toBe(short);
    expect(pickPlaybackUrl([offer(episode, 39)], 39)).toBe(episode);
    expect(pickPlaybackUrl([offer("https://www.nowtv.it/watch/playback/live/channel", 39)], 39)).toBeNull();
  });
  it.each([
    "https://www.netflix.com.evil.test/watch/123",
    "https://user:pass@www.netflix.com/watch/123",
    "http://www.netflix.com/watch/123",
    "https://www.netflix.com:8080/watch/123",
    "https://www.netflix.com/watch/123/other",
  ])("scarta redirect non validi: %s", (url) => {
    expect(pickPlaybackUrl([offer(url)], 8)).toBeNull();
  });
  it("non usa il link di una piattaforma diversa", () => {
    expect(pickPlaybackUrl([offer("https://www.netflix.com/watch/123")], 119)).toBeNull();
  });
});

describe("compatibilita link Disney gia distribuiti", () => {
  it("conserva export e conversione stretta della pagina titolo", () => {
    expect(disneyPlaybackHref("/go/tv/42/337", 337)).toBe("/go/tv/42/337?play=1");
    expect(
      disneyPlaybackHref(
        "https://www.disneyplus.com/browse/entity-8bb20e2f-01c4-4748-929b-61e6da32880b",
        337,
      ),
    ).toBe("https://www.disneyplus.com/play/8bb20e2f-01c4-4748-929b-61e6da32880b");
  });
});
