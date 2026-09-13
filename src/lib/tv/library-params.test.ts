import { describe, expect, it } from "vitest";
import { parseLibraryParams } from "./library-params";

const sp = (q: string) => new URLSearchParams(q);

describe("parseLibraryParams", () => {
  it("default: in corso, tutti, prima pagina", () => {
    expect(parseLibraryParams(sp(""))).toEqual({
      status: "watching",
      mediaType: null,
      offset: 0,
      limit: 60,
    });
  });
  it("legge stato, tipo e pagina", () => {
    expect(parseLibraryParams(sp("status=watched&type=tv&offset=120&limit=30"))).toEqual({
      status: "watched",
      mediaType: "tv",
      offset: 120,
      limit: 30,
    });
  });
  it("tetto e valori sporchi", () => {
    const p = parseLibraryParams(sp("status=boh&type=x&offset=-5&limit=999"));
    expect(p).toEqual({ status: "watching", mediaType: null, offset: 0, limit: 60 });
  });
});
