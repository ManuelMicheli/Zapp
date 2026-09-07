import { describe, expect, it } from "vitest";
import { secretMatches } from "./auth";

describe("secretMatches", () => {
  const expected = "a".repeat(32);

  it("accetta il segreto giusto", () => {
    expect(secretMatches(expected, expected)).toBe(true);
  });

  it("rifiuta un segreto sbagliato della stessa lunghezza", () => {
    expect(secretMatches("b".repeat(32), expected)).toBe(false);
  });

  it("rifiuta lunghezze diverse senza confrontare", () => {
    expect(secretMatches("a".repeat(31), expected)).toBe(false);
    expect(secretMatches("a".repeat(33), expected)).toBe(false);
  });

  it("rifiuta quando manca l'header", () => {
    expect(secretMatches(null, expected)).toBe(false);
  });

  it("rifiuta quando il segreto non è configurato", () => {
    expect(secretMatches(expected, undefined)).toBe(false);
    expect(secretMatches(expected, "")).toBe(false);
    expect(secretMatches("corto", "corto")).toBe(false);
  });
});
