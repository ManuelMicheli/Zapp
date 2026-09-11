import { describe, expect, it } from "vitest";
import { projectedPosition } from "./progress";

const at = Date.parse("2026-09-10T12:00:00Z");
const sample = {
  state: "playing",
  at: new Date(at).toISOString(),
  positionMs: 60_250,
  durationMs: 120_000,
};

describe("posizione live della copertina", () => {
  it("cambia secondo al confine della misura, senza attendere un heartbeat", () => {
    expect(projectedPosition(sample, at + 749)).toBe(60_999);
    expect(projectedPosition(sample, at + 750)).toBe(61_000);
    expect(projectedPosition(sample, at + 10_750)).toBe(71_000);
  });
  it("pausa e buffering non avanzano", () => {
    for (const state of ["paused", "buffering", "stopped"])
      expect(projectedPosition({ ...sample, state }, at + 10_000)).toBe(60_250);
  });
  it("si riallinea a un salto indietro e non supera la durata", () => {
    expect(projectedPosition({ ...sample, positionMs: 20_000 }, at + 1000)).toBe(21_000);
    expect(projectedPosition(sample, at + 70_000)).toBe(120_000);
  });
  it("non estrapola misure scadute, future o senza data valida", () => {
    for (const now of [at - 1000, at + 90_000])
      expect(projectedPosition(sample, now)).toBe(60_250);
    expect(projectedPosition({ ...sample, at: "invalid" }, at)).toBe(60_250);
  });
  it("con durata ignota conserva la posizione effettiva", () => {
    expect(projectedPosition({ ...sample, durationMs: null }, at + 1000)).toBe(61_250);
  });
});
