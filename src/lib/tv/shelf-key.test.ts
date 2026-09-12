import { describe, expect, it } from "vitest";
import { parseShelfKey } from "./shelf-key";

describe("parseShelfKey", () => {
  it("riconosce le chiavi fisse", () => {
    expect(parseShelfKey("foryou")).toEqual({ kind: "foryou" });
    expect(parseShelfKey("topten")).toEqual({ kind: "topten" });
    expect(parseShelfKey("want")).toEqual({ kind: "want" });
    expect(parseShelfKey("toprated")).toEqual({ kind: "toprated" });
    expect(parseShelfKey("comingsoon")).toEqual({ kind: "comingsoon" });
  });
  it("riconosce because e platform con parametri validi", () => {
    expect(parseShelfKey("because:movie:438631")).toEqual({
      kind: "because",
      mediaType: "movie",
      titleId: 438631,
    });
    expect(parseShelfKey("platform:337")).toEqual({ kind: "platform", providerId: 337 });
  });
  it("le rail passano per intero: `<dimensione>|<chiave>`, chiave opaca", () => {
    expect(parseShelfKey("generi|878")).toEqual({ kind: "rail", key: "generi|878" });
    expect(parseShelfKey("decenni|2000")).toEqual({ kind: "rail", key: "decenni|2000" });
    expect(parseShelfKey("persone|Regia:Denis Villeneuve")).toEqual({
      kind: "rail",
      key: "persone|Regia:Denis Villeneuve",
    });
    expect(parseShelfKey("persone|")).toBeNull();
    expect(parseShelfKey("attori|1")).toBeNull();
    expect(parseShelfKey("generi|" + "x".repeat(120))).toBeNull();
  });
  it("rifiuta il resto", () => {
    expect(parseShelfKey("because:book:1")).toBeNull();
    expect(parseShelfKey("because:movie:-1")).toBeNull();
    expect(parseShelfKey("platform:abc")).toBeNull();
    expect(parseShelfKey("")).toBeNull();
    expect(parseShelfKey("x".repeat(80))).toBeNull();
  });
});
