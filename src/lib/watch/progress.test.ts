import { describe, expect, it } from "vitest";
import { resumeLabel, resumeRatio } from "./progress";

describe("resumeLabel", () => {
  it("dice i minuti su quanti", () => {
    expect(resumeLabel(1_084_000, 4_560_000)).toBe("18 min di 76");
  });

  it("senza durata dice solo dove sei", () => {
    expect(resumeLabel(1_084_000, null)).toBe("18 min");
  });

  it("sotto il minuto non dice zero", () => {
    expect(resumeLabel(20_000, 4_560_000)).toBe("appena iniziato");
  });
});

describe("resumeRatio", () => {
  it("e' la frazione, limitata a 1", () => {
    expect(resumeRatio(1_140_000, 4_560_000)).toBeCloseTo(0.25);
    expect(resumeRatio(9_000_000, 4_560_000)).toBe(1);
  });

  it("senza durata non c'e' barra", () => {
    expect(resumeRatio(1_000, null)).toBeNull();
  });
});
