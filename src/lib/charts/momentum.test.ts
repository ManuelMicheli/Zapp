import { describe, expect, it } from "vitest";
import { computeMomentum } from "./momentum";

describe("computeMomentum", () => {
  it("conta le posizioni guadagnate", () => {
    expect(computeMomentum(3, 1)).toBe(2);
  });

  it("conta anche quelle perse", () => {
    expect(computeMomentum(1, 3)).toBe(-2);
  });

  it("un debutto al primo posto vale il massimo", () => {
    expect(computeMomentum(null, 1)).toBe(10);
  });

  it("un debutto non è mai una discesa", () => {
    expect(computeMomentum(null, 15)).toBe(0);
  });

  it("stessa posizione, nessun movimento", () => {
    expect(computeMomentum(5, 5)).toBe(0);
  });
});
