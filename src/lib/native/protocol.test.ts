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

  it("ready porta il nome del dispositivo quando c'è", () => {
    expect(
      parseNativeMessage({
        type: "ready",
        platform: "ios",
        version: "0.1.0",
        installId: INSTALL_ID,
        deviceName: "  iPhone di Manuel  ",
      }),
    ).toEqual({
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
      deviceName: "iPhone di Manuel",
    });
  });

  it("un nome troppo lungo o non stringa cade, il ready resta valido", () => {
    const base = {
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
    };
    expect(parseNativeMessage({ ...base, deviceName: "n".repeat(61) })).toEqual(base);
    expect(parseNativeMessage({ ...base, deviceName: "   " })).toEqual(base);
    expect(parseNativeMessage({ ...base, deviceName: 42 })).toEqual(base);
    expect(parseNativeMessage({ ...base, deviceName: null })).toEqual(base);
  });

  it("ready porta il deviceId quando è un uuid valido", () => {
    expect(
      parseNativeMessage({
        type: "ready",
        platform: "ios",
        version: "0.1.0",
        installId: INSTALL_ID,
        deviceId: INSTALL_ID,
      }),
    ).toEqual({
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
      deviceId: INSTALL_ID,
    });
  });

  it("un deviceId malformato cade, il ready resta valido", () => {
    const base = {
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
    };
    expect(parseNativeMessage({ ...base, deviceId: "non-un-uuid" })).toEqual(base);
    expect(parseNativeMessage({ ...base, deviceId: 42 })).toEqual(base);
    expect(parseNativeMessage({ ...base, deviceId: null })).toEqual(base);
  });

  it("ready senza deviceId resta valido senza il campo", () => {
    const base = {
      type: "ready",
      platform: "ios",
      version: "0.1.0",
      installId: INSTALL_ID,
    };
    expect(parseNativeMessage(base)).toEqual(base);
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

  it("scrobbleStatus vuole granted booleano", () => {
    expect(parseNativeMessage({ type: "scrobbleStatus", granted: true })).toEqual({
      type: "scrobbleStatus",
      granted: true,
    });
    expect(parseNativeMessage({ type: "scrobbleStatus", granted: false })).toEqual({
      type: "scrobbleStatus",
      granted: false,
    });
    expect(parseNativeMessage({ type: "scrobbleStatus", granted: "true" })).toBeNull();
    expect(parseNativeMessage({ type: "scrobbleStatus" })).toBeNull();
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

describe("parseNativeMessage — TV vicine", () => {
  it("accetta un tvFound con una TV Zapp", () => {
    const msg = parseNativeMessage({
      type: "tvFound",
      devices: [
        {
          kind: "zapp",
          name: "Fire TV di Mirko",
          host: "192.168.1.7",
          port: 41234,
          installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      ],
    });
    expect(msg).toEqual({
      type: "tvFound",
      devices: [
        {
          kind: "zapp",
          name: "Fire TV di Mirko",
          host: "192.168.1.7",
          port: 41234,
          installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      ],
    });
  });

  it("accetta una Fire TV senza porta ne' installId", () => {
    const msg = parseNativeMessage({
      type: "tvFound",
      devices: [{ kind: "firetv", name: "Fire TV di Mirko", host: "192.168.1.7" }],
    });
    expect(msg).toEqual({
      type: "tvFound",
      devices: [{ kind: "firetv", name: "Fire TV di Mirko", host: "192.168.1.7" }],
    });
  });

  it("scarta un indirizzo che non e' privato", () => {
    expect(
      parseNativeMessage({
        type: "tvFound",
        devices: [{ kind: "zapp", name: "TV", host: "8.8.8.8", port: 80 }],
      }),
    ).toBeNull();
  });

  it("scarta un elenco piu' lungo di sedici", () => {
    const devices = Array.from({ length: 17 }, () => ({
      kind: "firetv",
      name: "TV",
      host: "192.168.1.7",
    }));
    expect(parseNativeMessage({ type: "tvFound", devices })).toBeNull();
  });

  it("accetta tvConsent con un installId valido e scarta il resto", () => {
    expect(
      parseNativeMessage({
        type: "tvConsent",
        installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      }),
    ).toEqual({ type: "tvConsent", installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" });
    expect(parseNativeMessage({ type: "tvConsent", installId: "no" })).toBeNull();
  });

  it("accetta solo i motivi previsti in tvError", () => {
    expect(parseNativeMessage({ type: "tvError", motivo: "rifiutato" })).toEqual({
      type: "tvError",
      motivo: "rifiutato",
    });
    expect(parseNativeMessage({ type: "tvError", motivo: "boh" })).toBeNull();
  });
});
