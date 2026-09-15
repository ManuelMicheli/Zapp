import { describe, expect, it } from "vitest";
import { MAIN_PROVIDER_IDS, PROVIDERS } from "@/lib/config";
import { MASSA_MINIMA, MASSA_PIENA, toTasteVector } from "@/lib/rank/vector";
import type { Tables } from "@/types/database";
import { GENRES } from "@/lib/genres/catalog";
import { PLATFORMS, orderPlatforms, platformAffinity, platformByKey } from "./catalog";

function riga(patch: Partial<Tables<"user_taste">> = {}): Tables<"user_taste"> {
  return {
    user_id: "u",
    generi: {},
    decenni: {},
    provider: {},
    persone: {},
    tipo: {},
    runtime: {},
    lingua: {},
    novita: 0,
    massa: MASSA_PIENA,
    eventi_contati: 0,
    updated_at: "2026-09-15T00:00:00Z",
    ...patch,
  } as Tables<"user_taste">;
}

describe("catalogo delle piattaforme", () => {
  it("ha chiavi uniche, in minuscolo e senza spazi", () => {
    const chiavi = PLATFORMS.map((p) => p.key);
    expect(new Set(chiavi).size).toBe(chiavi.length);
    for (const k of chiavi) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("copre le piattaforme dell'accesso rapido, nello stesso ordine", () => {
    expect(PLATFORMS.map((p) => p.providerId)).toEqual([...MAIN_PROVIDER_IDS]);
  });

  it("tiene l'id principale fra i suoi id e non ne condivide nessuno", () => {
    const tutti: number[] = [];
    for (const p of PLATFORMS) {
      expect(p.ids).toContain(p.providerId);
      expect(PROVIDERS[p.providerId]).toBeDefined();
      tutti.push(...p.ids);
    }
    // Un id in due voci vorrebbe dire due pagine con lo stesso catalogo.
    expect(new Set(tutti).size).toBe(tutti.length);
  });

  it("non usa una chiave già presa da un genere", () => {
    // Generi e piattaforme condividono la rotta `/discover/[type]/[chiave]`: una chiave
    // in comune vorrebbe dire una pagina che ne nasconde un'altra.
    const generi = new Set(GENRES.map((g) => g.key));
    for (const p of PLATFORMS) expect(generi.has(p.key)).toBe(false);
  });

  it("trova una voce per chiave e ignora quelle inventate", () => {
    expect(platformByKey("netflix")?.providerId).toBe(8);
    expect(platformByKey("nonesiste")).toBeUndefined();
  });

  it("conta anche gli id secondari nell'affinità", () => {
    // 2100 = Prime Video with Ads: chi guarda lì guarda Prime Video
    const v = toTasteVector(riga({ provider: { "2100": 10 } }));
    const prime = platformByKey("prime-video")!;
    expect(platformAffinity(v, prime)).toBe(1);
    expect(platformAffinity(v, platformByKey("netflix")!)).toBe(0);
  });

  it("porta in testa le piattaforme su cui l'utente guarda davvero", () => {
    const v = toTasteVector(riga({ provider: { "39": 10, "222": 4 } }));
    const ordinate = orderPlatforms(v).map((p) => p.key);
    expect(ordinate.slice(0, 2)).toEqual(["now", "raiplay"]);
    expect(ordinate).toHaveLength(PLATFORMS.length);
    expect(new Set(ordinate).size).toBe(PLATFORMS.length);
  });

  it("con profilo povero o assente lascia l'ordine del catalogo", () => {
    const povero = toTasteVector(
      riga({ massa: MASSA_MINIMA - 1, provider: { "39": 10 } }),
    );
    expect(orderPlatforms(povero)).toEqual(PLATFORMS);
    expect(orderPlatforms(null)).toEqual(PLATFORMS);
  });
});
