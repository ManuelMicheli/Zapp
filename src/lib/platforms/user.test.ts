import { describe, expect, it } from "vitest";
import { chiaviValide } from "./keys";

describe("chiaviValide", () => {
  it("tiene solo le chiavi del catalogo", () => {
    expect(chiaviValide(["netflix", "pippo", "now"])).toEqual(["netflix", "now"]);
  });

  it("toglie i doppioni", () => {
    expect(chiaviValide(["netflix", "netflix"])).toEqual(["netflix"]);
  });

  it("regge quello che arriva storto dal client", () => {
    expect(chiaviValide(null)).toEqual([]);
    expect(chiaviValide("netflix")).toEqual([]);
    expect(chiaviValide([1, true, null, "disney-plus"])).toEqual(["disney-plus"]);
  });

  it("non accetta piu' chiavi di quante ne esistano", () => {
    const tante = Array.from({ length: 50 }, (_, i) => `x${i}`).concat("netflix");
    expect(chiaviValide(tante)).toEqual(["netflix"]);
  });
});
