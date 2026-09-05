import { describe, expect, it } from "vitest";
import { OFFICIAL_CHANNELS, isOfficialChannelId, matchOfficialChannel } from "./channels";

describe("OFFICIAL_CHANNELS", () => {
  it("ha id YouTube (UC…) e handle unici", () => {
    const ids = new Set(OFFICIAL_CHANNELS.map((c) => c.id));
    const handles = new Set(OFFICIAL_CHANNELS.map((c) => c.handle.toLowerCase()));
    expect(ids.size).toBe(OFFICIAL_CHANNELS.length);
    expect(handles.size).toBe(OFFICIAL_CHANNELS.length);
    for (const c of OFFICIAL_CHANNELS) expect(c.id).toMatch(/^UC[\w-]{22}$/);
  });
});

describe("isOfficialChannelId", () => {
  it("riconosce Warner Bros. Italia e rifiuta gli altri", () => {
    expect(isOfficialChannelId("UCIQ5iN8wzGkKyXJeX6eR50Q")).toBe(true);
    expect(isOfficialChannelId("UCxxxxxxxxxxxxxxxxxxxxxx")).toBe(false);
    expect(isOfficialChannelId(undefined)).toBe(false);
  });
});

describe("matchOfficialChannel", () => {
  it("abbina per handle di author_url, senza distinguere maiuscole", () => {
    const c = matchOfficialChannel({
      authorUrl: "https://www.youtube.com/@WarnerBrosItalia",
      authorName: "qualunque",
    });
    expect(c?.name).toBe("Warner Bros. Italia");
  });
  it("ripiega sul nome quando l'url non ha handle", () => {
    const c = matchOfficialChannel({
      authorUrl: "https://www.youtube.com/channel/UCpLWRKkNwJOOj_NXDobKWUQ",
      authorName: "Sony Pictures Italia",
    });
    expect(c?.handle).toBe("SonyPicturesIT");
  });
  it("null per canali non ufficiali", () => {
    expect(
      matchOfficialChannel({
        authorUrl: "https://www.youtube.com/@MrMovieItalia",
        authorName: "Mr. Movie Italia",
      }),
    ).toBeNull();
    expect(
      matchOfficialChannel({ authorUrl: undefined, authorName: undefined }),
    ).toBeNull();
  });
  it("i canali globali (Netflix, MUBI, Apple TV) non sono marcati italiani", () => {
    expect(
      matchOfficialChannel({
        authorUrl: "https://www.youtube.com/@Netflix",
        authorName: "",
      })?.italian,
    ).toBe(false);
    expect(
      matchOfficialChannel({
        authorUrl: "https://www.youtube.com/@netflixitalia",
        authorName: "",
      })?.italian,
    ).toBe(true);
  });
});
