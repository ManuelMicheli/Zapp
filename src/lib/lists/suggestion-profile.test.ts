import { describe, expect, it } from "vitest";
import { toTasteVector } from "@/lib/rank/vector";
import type { Tables } from "@/types/database";
import { parseListRecommendationProfile } from "./suggestion-profile";

describe("parseListRecommendationProfile", () => {
  it("preserva il vettore aggregato senza rinormalizzarlo", () => {
    const parsed = parseListRecommendationProfile({
      vector: {
        generi: { "18": 0.25, "35": -0.5 },
        decenni: {},
        provider: {},
        persone: {},
        tipo: { movie: 0.4 },
        runtime: {},
        lingua: {},
      },
      fiducia: 0.75,
      abbastanza: true,
      contributorCount: 2,
      memberCount: 3,
    });

    expect(parsed?.vector.generi).toEqual(
      new Map([
        ["18", 0.25],
        ["35", -0.5],
      ]),
    );
    expect(parsed?.vector.tipo.get("movie")).toBe(0.4);
    expect(parsed).toMatchObject({
      contributorCount: 2,
      memberCount: 3,
      vector: { fiducia: 0.75, abbastanza: true },
    });
  });

  it("accetta il ripiego neutro senza contributori", () => {
    const parsed = parseListRecommendationProfile({
      vector: {
        generi: {},
        decenni: {},
        provider: {},
        persone: {},
        tipo: {},
        runtime: {},
        lingua: {},
      },
      fiducia: 0,
      abbastanza: false,
      contributorCount: 0,
      memberCount: 2,
    });

    expect(parsed?.vector.fiducia).toBe(0);
    expect(parsed?.vector.abbastanza).toBe(false);
    expect(parsed?.contributorCount).toBe(0);
  });

  it("rifiuta payload parziali o valori fuori scala", () => {
    expect(parseListRecommendationProfile(null)).toBeNull();
    expect(
      parseListRecommendationProfile({
        vector: { generi: { "18": 2 } },
        fiducia: 1,
        abbastanza: true,
        contributorCount: 1,
        memberCount: 1,
      }),
    ).toBeNull();
  });

  it("a un contributore coincide con il normalizzatore canonico", () => {
    const row = {
      user_id: "fixture",
      generi: { "18": 2, "35": 1 },
      decenni: { "2020": 4, "1990": -2 },
      provider: { "8": 3 },
      persone: { "Regia:Nome": 5, "Cast:Altro": 1 },
      tipo: { movie: 2, tv: 1 },
      runtime: { corto: -1, medio: 2 },
      lingua: { it: 4, en: 2 },
      novita: 0,
      massa: 30,
      eventi_contati: 0,
      updated_at: "2026-09-14T00:00:00Z",
    } as Tables<"user_taste">;
    const canonical = toTasteVector(row);
    const parsed = parseListRecommendationProfile({
      vector: {
        generi: { "18": 1, "35": 0.5 },
        decenni: { "2020": 1, "1990": -0.5 },
        provider: { "8": 1 },
        persone: { "Regia:Nome": 1, "Cast:Altro": 0.2 },
        tipo: { movie: 1, tv: 0.5 },
        runtime: { corto: -0.5, medio: 1 },
        lingua: { it: 1, en: 0.5 },
      },
      fiducia: 0.5,
      abbastanza: true,
      contributorCount: 1,
      memberCount: 1,
    });

    expect(parsed?.vector).toEqual(canonical);
  });
});
