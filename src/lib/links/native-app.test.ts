import { describe, expect, it } from "vitest";
import { androidIntentUrl, isAndroidUa, isIosUa, nativeOpen } from "./native-app";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const DISNEY = 337;
const NETFLIX = 8;
const URL_DISNEY =
  "https://www.disneyplus.com/browse/entity-6e497c43-d4da-4e12-b100-d4d38dc2a7ff";

describe("riconoscimento del sistema", () => {
  it("Android sì, Windows no (anche se la stringa dice Android)", () => {
    expect(isAndroidUa(ANDROID)).toBe(true);
    expect(isAndroidUa(DESKTOP)).toBe(false);
    expect(isAndroidUa("Mozilla/5.0 (Windows NT 10.0) Android")).toBe(false);
  });

  it("iPhone, iPad e iPod", () => {
    expect(isIosUa(IPHONE)).toBe(true);
    expect(isIosUa(ANDROID)).toBe(false);
  });
});

describe("androidIntentUrl", () => {
  it("porta pacchetto, schema e ripiego sul sito", () => {
    const intent = androidIntentUrl(URL_DISNEY, DISNEY)!;
    expect(intent).toContain(
      "intent://www.disneyplus.com/browse/entity-6e497c43-d4da-4e12-b100-d4d38dc2a7ff#Intent;",
    );
    expect(intent).toContain("scheme=https;");
    expect(intent).toContain("package=com.disney.disneyplus;");
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(URL_DISNEY)};`);
    expect(intent.endsWith(";end")).toBe(true);
  });

  it("il ripiego è codificato: nessun ; o & rompe la grammatica dell'intent", () => {
    const url = "https://www.disneyplus.com/browse/x?a=1&b=2";
    const intent = androidIntentUrl(url, DISNEY)!;
    const fallback = intent.split("S.browser_fallback_url=")[1].replace(";end", "");
    expect(fallback).not.toContain("&");
    expect(decodeURIComponent(fallback)).toBe(url);
  });

  it("tiene la query della pagina ma non il frammento", () => {
    const intent = androidIntentUrl("https://www.disneyplus.com/a?b=1#c", DISNEY)!;
    expect(intent).toContain("intent://www.disneyplus.com/a?b=1#Intent;");
  });

  it("niente per una piattaforma che si apre da sola o per un URL non https", () => {
    expect(androidIntentUrl(URL_DISNEY, NETFLIX)).toBeNull();
    expect(androidIntentUrl("http://www.disneyplus.com/x", DISNEY)).toBeNull();
    expect(androidIntentUrl("/go/movie/1/337", DISNEY)).toBeNull();
  });
});

describe("nativeOpen", () => {
  it("Disney+ su Android va all'intent", () => {
    const { mode, href } = nativeOpen({
      url: URL_DISNEY,
      providerId: DISNEY,
      ua: ANDROID,
    });
    expect(mode).toBe("android-intent");
    expect(href.startsWith("intent://")).toBe(true);
  });

  it("Disney+ su iPhone resta lo stesso URL, ma top-level", () => {
    expect(nativeOpen({ url: URL_DISNEY, providerId: DISNEY, ua: IPHONE })).toEqual({
      mode: "ios-top-level",
      href: URL_DISNEY,
    });
  });

  it("su desktop, per le altre piattaforme e senza provider: link normale", () => {
    expect(nativeOpen({ url: URL_DISNEY, providerId: DISNEY, ua: DESKTOP }).mode).toBe(
      "default",
    );
    expect(
      nativeOpen({
        url: "https://www.netflix.com/title/1",
        providerId: NETFLIX,
        ua: ANDROID,
      }).mode,
    ).toBe("default");
    expect(nativeOpen({ url: URL_DISNEY, providerId: null, ua: ANDROID }).mode).toBe(
      "default",
    );
  });

  it("un link /go/ resta normale: la destinazione non si conosce ancora", () => {
    const go = "/go/movie/12/337";
    expect(nativeOpen({ url: go, providerId: DISNEY, ua: ANDROID })).toEqual({
      mode: "default",
      href: go,
    });
  });

  it.each([
    "/go/tv/42/337?play=1",
    "/play/movie/42/337",
    "/play/tv/42/337?season=1&episode=2",
  ])("Play Disney relativo su iOS resta top-level: %s", (url) => {
    expect(nativeOpen({ url, providerId: DISNEY, ua: IPHONE })).toEqual({
      mode: "ios-top-level",
      href: url,
    });
  });

  it.each([
    "/play/tv/42/337?episode=2",
    "/play/tv/42/337?season=1&episode=2&next=https://evil.test",
    "/play/tv/42/8?season=1&episode=2",
  ])("non forza una forma Play Disney relativa invalida: %s", (url) => {
    expect(nativeOpen({ url, providerId: DISNEY, ua: IPHONE }).mode).toBe("default");
  });
});
