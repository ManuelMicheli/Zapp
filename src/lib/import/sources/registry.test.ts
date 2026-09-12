import { describe, expect, it } from "vitest";
import { isSourceSlug, parseSource, SOURCE_LIST, SOURCES } from "./registry";

describe("registry", () => {
  it("elenca le quattro sorgenti con slug coerenti", () => {
    expect(SOURCE_LIST.map((s) => s.slug)).toEqual([
      "netflix",
      "letterboxd",
      "tvtime",
      "file",
    ]);
    for (const meta of SOURCE_LIST) expect(SOURCES[meta.slug]).toBe(meta);
    expect(isSourceSlug("netflix")).toBe(true);
    expect(isSourceSlug("trakt")).toBe(false);
  });

  it("smista al parser giusto: Netflix resta Netflix", () => {
    const out = parseSource("netflix", [
      {
        name: "NetflixViewingHistory.csv",
        text: 'Title,Date\n"Dark: Stagione 1: Segreti","05/12/2023"\n',
      },
    ]);
    expect(out.rows).toBe(1);
    expect(out.candidates[0]).toMatchObject({ kind: "tv", netflixTitle: "Dark" });
  });
});
