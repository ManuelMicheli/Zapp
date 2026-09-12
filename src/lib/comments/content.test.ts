import { describe, expect, it } from "vitest";
import {
  decodeComment,
  encodeComment,
  isCommentBody,
  isMediaUrl,
  type CommentMedia,
} from "./content";
import { klipyUrl, parseKlipyPage } from "./klipy";

const media: CommentMedia = {
  kind: "gif",
  slug: "wow",
  title: "Wow",
  url: "https://static.klipy.com/wow.gif",
  previewUrl: "https://static.klipy.com/wow.jpg",
  width: 240,
  height: 160,
};

describe("commenti multimediali", () => {
  it("conserva testo, emoji e vecchi commenti senza trasformarli", () => {
    const text = "Che finale! 😭🎬\nAncora incredibile";
    expect(encodeComment(text, null)).toBe(text);
    expect(decodeComment(text)).toEqual({ text, media: null });
  });
  it("rilegge un allegato con testo o da solo", () => {
    for (const text of ["", "Sì! 😍", '"test"\n\\']) {
      const body = encodeComment(text, media);
      expect(isCommentBody(body)).toBe(true);
      expect(decodeComment(body)).toEqual({ text, media });
    }
  });
  it.each([
    "http://static.klipy.com/x.gif",
    "https://static.klipy.com.evil.test/x.gif",
    "https://evil.test/x.gif",
    "https://u:p@static.klipy.com/x.gif",
    "https://static.klipy.com:8443/x.gif",
    "javascript:alert(1)",
    "data:image/svg+xml,x",
    "https://127.0.0.1/a.gif",
    "https://static.klipy.com/x.svg",
    "https://static.klipy.com/../api",
  ])("rifiuta URL ostile %s", (url) => {
    expect(isMediaUrl(url)).toBe(false);
    expect(isCommentBody(encodeComment("", { ...media, url }))).toBe(false);
  });
  it("mantiene query originali del CDN", () => {
    const url = media.url + "?a=1&b=2";
    expect(isMediaUrl(url)).toBe(true);
    expect(decodeComment(encodeComment("", { ...media, url })).media?.url).toBe(url);
  });
  it("rifiuta vuoti, eccessi e strutture falsificate", () => {
    for (const value of [
      null,
      3,
      " ",
      "x".repeat(2001),
      "[zapp-media:1]{",
      '[zapp-media:1]{"text":"","media":{}}',
      encodeComment("x".repeat(2000), media),
      encodeComment("", { ...media, width: -1 }),
    ])
      expect(isCommentBody(value)).toBe(false);
    expect(isCommentBody("x".repeat(2000))).toBe(true);
  });
  it("non rende media per payload corrotti letti dal DB", () => {
    expect(
      decodeComment('[zapp-media:1]{"media":{"url":"https://evil.test/x.gif"}}').media,
    ).toBeNull();
  });
});

describe("catalogo KLIPY", () => {
  it("usa una miniatura leggera e conserva l'originale per il commento", () => {
    const small = "https://static.klipy.com/small.gif";
    const result = parseKlipyPage({ result: true, data: { data: [{ slug: "wow", title: "Wow", file: { hd: { gif: { url: media.url, width: 600, height: 400 } }, sm: { gif: { url: small, width: 240, height: 160 } } } }] } }, "gif");
    expect(result.items[0].thumbnailUrl).toBe(small);
    expect(result.items[0].url).toBe(media.url);
  });
  it("richiede meme correnti e ricerca italiana con query codificata", () => {
    const trending = new URL(klipyUrl("key", "meme", "", 1));
    expect(trending.pathname).toBe("/api/v1/key/static-memes/trending");
    expect(trending.searchParams.get("locale")).toBe("it");
    const search = new URL(klipyUrl("key", "gif", "amici & cinema", 2));
    expect(search.pathname).toContain("gifs/search");
    expect(search.searchParams.get("q")).toBe("amici & cinema");
    expect(search.searchParams.get("page")).toBe("2");
  });
  it("mappa file ufficiali mantenendo ordine, dimensioni e paginazione", () => {
    const item = (slug: string) => ({
      slug,
      title: slug,
      file: {
        hd: {
          gif: { url: media.url, width: 240, height: 160 },
          jpg: { url: media.previewUrl },
        },
      },
    });
    const page = parseKlipyPage(
      { result: true, data: { data: [item("a"), item("b")], has_next: true } },
      "gif",
    );
    expect(page.items.map((i) => i.slug)).toEqual(["a", "b"]);
    expect(page.items[0].previewUrl).toBe(media.previewUrl);
    expect(page.hasNext).toBe(true);
  });
  it("rifiuta risposte errate invece di mostrare falsi risultati vuoti", () => {
    for (const value of [
      { result: false },
      {},
      { result: true, data: { data: [{ type: "ad" }] } },
    ])
      expect(() => parseKlipyPage(value, "gif")).toThrow();
  });
});
