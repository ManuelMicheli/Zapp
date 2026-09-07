import { describe, expect, it } from "vitest";
import { parseTrailers } from "./stored";

describe("parseTrailers", () => {
  it("legge la lista salvata, in ordine", () => {
    expect(
      parseTrailers([
        { key: "a", frame: { x: 0, y: 0.125, w: 1, h: 0.75 }, lang: "it" },
        { key: "b", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "en" },
      ]),
    ).toEqual([
      { key: "a", frame: { x: 0, y: 0.125, w: 1, h: 0.75 }, lang: "it" },
      { key: "b", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "en" },
    ]);
    expect(parseTrailers([])).toEqual([]);
  });
  it("null per righe vecchie o forme sbagliate (si ricalcola)", () => {
    expect(parseTrailers(null)).toBeNull();
    expect(parseTrailers("x")).toBeNull();
    expect(parseTrailers([{ key: "a" }])).toBeNull();
    expect(
      parseTrailers([{ key: "a", frame: { x: "0", y: 0, w: 1, h: 1 }, lang: "it" }]),
    ).toBeNull();
    expect(parseTrailers(["a"])).toBeNull();
  });
  it("scarta una riga senza lingua: forma vecchia, da ricalcolare", () => {
    expect(parseTrailers([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 } }])).toBeNull();
  });
  it("scarta una lingua sconosciuta", () => {
    expect(
      parseTrailers([{ key: "abc", frame: { x: 0, y: 0, w: 1, h: 1 }, lang: "fr" }]),
    ).toBeNull();
  });
});
