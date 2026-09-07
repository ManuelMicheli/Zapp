import { describe, expect, it } from "vitest";
import {
  escapeLike,
  isIntInRange,
  isMediaType,
  isSafeExternalUrl,
  isTmdbId,
  isUuid,
  safeNextPath,
} from "./validate";

describe("isUuid", () => {
  it("accetta un uuid v4", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });
  it("rifiuta stringhe che non lo sono", () => {
    for (const bad of [
      "",
      "3f2504e0-4f89-41d3-9a0c",
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301'",
      "x,status.eq.accepted",
      null,
      42,
    ]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe("isTmdbId", () => {
  it("accetta interi positivi", () => {
    expect(isTmdbId(603)).toBe(true);
  });
  it("rifiuta zero, negativi, decimali e non numeri", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, "603", null]) {
      expect(isTmdbId(bad)).toBe(false);
    }
  });
});

describe("isMediaType", () => {
  it("accetta movie e tv soltanto", () => {
    expect(isMediaType("movie")).toBe(true);
    expect(isMediaType("tv")).toBe(true);
    expect(isMediaType("person")).toBe(false);
  });
});

describe("isIntInRange", () => {
  it("controlla gli estremi", () => {
    expect(isIntInRange(1, 1, 10)).toBe(true);
    expect(isIntInRange(10, 1, 10)).toBe(true);
    expect(isIntInRange(0, 1, 10)).toBe(false);
    expect(isIntInRange(11, 1, 10)).toBe(false);
    expect(isIntInRange(1.5, 1, 10)).toBe(false);
  });
});

describe("escapeLike", () => {
  it("neutralizza i jolly di PostgREST", () => {
    expect(escapeLike("%a")).toBe("\\%a");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a*b")).toBe("a\\*b");
  });
  it("lascia stare il testo normale", () => {
    expect(escapeLike("manuel")).toBe("manuel");
  });
});

describe("isSafeExternalUrl", () => {
  it("accetta https verso un dominio pubblico", () => {
    expect(isSafeExternalUrl("https://www.netflix.com/title/80100172")).toBe(true);
  });
  it("rifiuta schemi, credenziali e host locali", () => {
    for (const bad of [
      "http://www.netflix.com",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "https://utente:password@evil.example/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://intranet/x",
      "non un url",
      "",
      null,
    ]) {
      expect(isSafeExternalUrl(bad)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it("tiene un percorso interno", () => {
    expect(safeNextPath("/library")).toBe("/library");
    expect(safeNextPath("/title/movie/603?x=1")).toBe("/title/movie/603?x=1");
  });
  it("scarta tutto cio' che porta fuori dall'app", () => {
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
