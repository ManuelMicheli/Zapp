import { describe, expect, it } from "vitest";
import { buildShelfManifest } from "./manifest";

const rails = [
  {
    key: "persona:1",
    titolo: "Ancora con Denis Villeneuve",
    dimensione: "persone" as const,
  },
  {
    key: "genere:878",
    titolo: "Perché ami la fantascienza",
    dimensione: "generi" as const,
  },
  {
    key: "decennio:2000",
    titolo: "Il meglio degli anni 2000",
    dimensione: "decenni" as const,
  },
];
const because = [{ titleId: 5, mediaType: "movie" as const, name: "Dune" }];

describe("buildShelfManifest", () => {
  it("profilo ricco: prima cio' che parla di te, come la home web", () => {
    const keys = buildShelfManifest({
      profiloRicco: true,
      rails,
      because,
      hasWant: true,
      platformIds: [8, 337],
    }).map((s) => s.key);
    expect(keys).toEqual([
      "foryou",
      "persona:1",
      "because:movie:5",
      "genere:878",
      "decennio:2000",
      "topten",
      "want",
      "platform:8",
      "platform:337",
      "toprated",
      "comingsoon",
    ]);
  });

  it("profilo povero: prima le classifiche, i consigli dopo", () => {
    const keys = buildShelfManifest({
      profiloRicco: false,
      rails: [],
      because,
      hasWant: false,
      platformIds: [8],
    }).map((s) => s.key);
    expect(keys).toEqual([
      "topten",
      "platform:8",
      "foryou",
      "because:movie:5",
      "toprated",
      "comingsoon",
    ]);
  });

  it("titoli e layout", () => {
    const shelves = buildShelfManifest({
      profiloRicco: false,
      rails: [],
      because,
      hasWant: true,
      platformIds: [],
    });
    expect(shelves.find((s) => s.key === "topten")?.layout).toBe("numbered");
    expect(shelves.find((s) => s.key === "comingsoon")?.layout).toBe("backdrop");
    expect(shelves.find((s) => s.key === "because:movie:5")?.title).toBe(
      "Perché hai visto Dune",
    );
    expect(shelves.find((s) => s.key === "want")?.title).toBe("Da vedere");
  });
});
