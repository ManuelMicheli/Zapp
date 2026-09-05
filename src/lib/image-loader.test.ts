import { describe, expect, it } from "vitest";
import imageLoader, { tmdbSizeFor } from "./image-loader";

const POSTER = "https://image.tmdb.org/t/p/w342/abc.jpg";
const BACKDROP = "https://image.tmdb.org/t/p/original/def.jpg";

describe("tmdbSizeFor", () => {
  it("sceglie la taglia TMDB più piccola che copre la larghezza richiesta", () => {
    expect(tmdbSizeFor(40)).toBe("w92");
    expect(tmdbSizeFor(92)).toBe("w92");
    expect(tmdbSizeFor(160)).toBe("w185");
    expect(tmdbSizeFor(384)).toBe("w500");
    expect(tmdbSizeFor(640)).toBe("w780");
    expect(tmdbSizeFor(1080)).toBe("w1280");
  });

  it("sopra 1280 chiede l'originale", () => {
    expect(tmdbSizeFor(1281)).toBe("original");
    expect(tmdbSizeFor(3840)).toBe("original");
  });
});

describe("imageLoader", () => {
  it("riscrive la taglia TMDB in base alla larghezza, senza passare da /_next/image", () => {
    expect(imageLoader({ src: POSTER, width: 384 })).toBe(
      "https://image.tmdb.org/t/p/w500/abc.jpg",
    );
    expect(imageLoader({ src: BACKDROP, width: 1080 })).toBe(
      "https://image.tmdb.org/t/p/w1280/def.jpg",
    );
    expect(imageLoader({ src: BACKDROP, width: 1920 })).toBe(BACKDROP);
  });

  it("lascia intatti gli URL non TMDB (avatar Supabase, asset locali)", () => {
    const avatar = "https://x.supabase.co/storage/v1/object/public/avatars/u.jpg";
    expect(imageLoader({ src: avatar, width: 92 })).toBe(avatar);
    expect(imageLoader({ src: "/icons/icon-192.png", width: 192 })).toBe(
      "/icons/icon-192.png",
    );
  });

  it("ignora quality: il CDN TMDB non lo supporta", () => {
    expect(imageLoader({ src: POSTER, width: 92, quality: 95 })).toBe(
      "https://image.tmdb.org/t/p/w92/abc.jpg",
    );
  });
});
