import { describe, expect, it } from "vitest";
import { parseTrailers } from "./stored";

describe("parseTrailers", () => {
  it("legge la lista salvata, in ordine", () => {
    expect(
      parseTrailers([
        { key: "a", frame: { x: 0, y: 0.125, w: 1, h: 0.75 } },
        { key: "b", frame: { x: 0, y: 0, w: 1, h: 1 } },
      ]),
    ).toEqual([
      { key: "a", frame: { x: 0, y: 0.125, w: 1, h: 0.75 } },
      { key: "b", frame: { x: 0, y: 0, w: 1, h: 1 } },
    ]);
    expect(parseTrailers([])).toEqual([]);
  });
  it("null per righe vecchie o forme sbagliate (si ricalcola)", () => {
    expect(parseTrailers(null)).toBeNull();
    expect(parseTrailers("x")).toBeNull();
    expect(parseTrailers([{ key: "a" }])).toBeNull();
    expect(parseTrailers([{ key: "a", frame: { x: "0", y: 0, w: 1, h: 1 } }])).toBeNull();
    expect(parseTrailers(["a"])).toBeNull();
  });
});
