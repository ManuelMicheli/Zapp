import { describe, expect, it } from "vitest";
import { formatScore, formatVotes } from "./format";

describe("formatVotes", () => {
  it("scrive i milioni con un decimale", () => {
    expect(formatVotes(2_412_883)).toBe("2,4M");
    expect(formatVotes(1_000_000)).toBe("1M");
  });

  it("scrive le decine di migliaia in migliaia tonde", () => {
    expect(formatVotes(24_400)).toBe("24mila");
    expect(formatVotes(10_000)).toBe("10mila");
  });

  it("sotto le diecimila resta il numero intero", () => {
    // l'italiano non separa le migliaia a quattro cifre: 9999, non 9.999
    expect(formatVotes(9_999)).toBe("9999");
    expect(formatVotes(120)).toBe("120");
  });

  it("zero e valori impossibili non rompono la riga", () => {
    expect(formatVotes(0)).toBe("0");
    expect(formatVotes(Number.NaN)).toBe("0");
    expect(formatVotes(-5)).toBe("0");
  });
});

describe("formatScore", () => {
  it("usa la virgola e un decimale", () => {
    expect(formatScore(8.42)).toBe("8,4");
    expect(formatScore(8)).toBe("8");
  });
});
