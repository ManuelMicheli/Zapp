import { describe, expect, it } from "vitest";
import {
  isInternalPath,
  isNativeShell,
  nativePlatformFromUa,
  parseNativeMessage,
} from "./protocol";

const UA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZappMobile/0.1.0 (ios)";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 ZappMobile/0.1.0 (android)";
const UA_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const INSTALL_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("isNativeShell", () => {
  it("riconosce il guscio su iOS e su Android", () => {
    expect(isNativeShell(UA_IOS)).toBe(true);
    expect(isNativeShell(UA_ANDROID)).toBe(true);
  });

  it("un Safari normale non è il guscio", () => {
    expect(isNativeShell(UA_SAFARI)).toBe(false);
    expect(isNativeShell("")).toBe(false);
  });
});

describe("nativePlatformFromUa", () => {
  it("legge la piattaforma dichiarata", () => {
    expect(nativePlatformFromUa(UA_IOS)).toBe("ios");
    expect(nativePlatformFromUa(UA_ANDROID)).toBe("android");
  });

  it("null fuori dal guscio", () => {
    expect(nativePlatformFromUa(UA_SAFARI)).toBeNull();
  });
});

describe("isInternalPath", () => {
  it("un percorso interno comincia con una sola barra", () => {
    expect(isInternalPath("/")).toBe(true);
    expect(isInternalPath("/a?b=1")).toBe(true);
  });

  it("niente protocol-relative, relativi, schemi o vuoto", () => {
    expect(isInternalPath("//x")).toBe(false);
    expect(isInternalPath("a")).toBe(false);
    expect(isInternalPath("http://x")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });
});

describe("parseNativeMessage", () => {
  it("ready valido torna uguale a sé stesso", () => {
    const msg = {
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
    };
    expect(parseNativeMessage(msg)).toEqual(msg);
  });

  it("ready tiene solo i campi noti", () => {
    expect(
      parseNativeMessage({
        type: "ready",
        platform: "android",
        version: "0.1.0",
        installId: INSTALL_ID,
        extra: "non richiesto",
      }),
    ).toEqual({
      type: "ready",
      platform: "android",
      version: "0.1.0",
      installId: INSTALL_ID,
    });
  });

  it("ready con installId non uuid è null", () => {
    expect(
      parseNativeMessage({
        type: "ready",
        platform: "ios",
        version: "0.1.0",
        installId: "non-un-uuid",
      }),
    ).toBeNull();
  });

  it("tipo sconosciuto e forme non a oggetto sono null", () => {
    expect(parseNativeMessage({ type: "boh" })).toBeNull();
    expect(parseNativeMessage(null)).toBeNull();
    expect(parseNativeMessage([{ type: "ready" }])).toBeNull();
    expect(parseNativeMessage("ready")).toBeNull();
  });

  it("pushToken vuole una stringa non vuota", () => {
    expect(parseNativeMessage({ type: "pushToken", token: "ExpoPush[abc]" })).toEqual({
      type: "pushToken",
      token: "ExpoPush[abc]",
    });
    expect(parseNativeMessage({ type: "pushToken", token: "" })).toBeNull();
    expect(parseNativeMessage({ type: "pushToken" })).toBeNull();
  });

  it("deepLink accetta solo un percorso interno", () => {
    expect(parseNativeMessage({ type: "deepLink", path: "/title/movie/1" })).toEqual({
      type: "deepLink",
      path: "/title/movie/1",
    });
    expect(parseNativeMessage({ type: "deepLink", path: "//evil.test" })).toBeNull();
    expect(parseNativeMessage({ type: "deepLink", path: "https://x" })).toBeNull();
  });

  it("sharedContent: solo http(s), e almeno un campo", () => {
    expect(
      parseNativeMessage({ type: "sharedContent", url: "javascript:alert(1)" }),
    ).toBeNull();
    expect(parseNativeMessage({ type: "sharedContent" })).toBeNull();
    expect(parseNativeMessage({ type: "sharedContent", text: "Dune" })).toEqual({
      type: "sharedContent",
      text: "Dune",
    });
    expect(
      parseNativeMessage({
        type: "sharedContent",
        url: "https://x.test/a",
        text: "Dune",
      }),
    ).toEqual({ type: "sharedContent", url: "https://x.test/a", text: "Dune" });
  });
});
