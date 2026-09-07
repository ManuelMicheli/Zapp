import { describe, expect, it } from "vitest";
import { decay, rawWeight, weightOf, type TasteRow } from "./weights";

const ORA = new Date("2026-09-07T12:00:00Z");

function riga(patch: Partial<TasteRow> = {}): TasteRow {
  return {
    titleId: 1,
    mediaType: "movie",
    status: null,
    rating: null,
    lastWatchedAt: null,
    isSeed: false,
    impressionSessions: 0,
    opens: 0,
    providerOpens: 0,
    trailers: 0,
    dismisses: 0,
    lastEventAt: null,
    ...patch,
  };
}

describe("decay", () => {
  it("vale 1 oggi", () => {
    expect(decay(ORA.toISOString(), ORA)).toBeCloseTo(1, 5);
  });

  it("dimezza a 180 giorni", () => {
    const sei_mesi_fa = new Date(ORA.getTime() - 180 * 86400_000).toISOString();
    expect(decay(sei_mesi_fa, ORA)).toBeCloseTo(0.5, 3);
  });

  it("vale un quarto a 360 giorni (due emivite)", () => {
    const due = new Date(ORA.getTime() - 360 * 86400_000).toISOString();
    expect(decay(due, ORA)).toBeCloseTo(0.25, 3);
  });

  it("non supera mai 1, nemmeno con una data futura (orologi storti)", () => {
    const domani = new Date(ORA.getTime() + 86400_000).toISOString();
    expect(decay(domani, ORA)).toBe(1);
  });

  it("senza data vale 1: un segnale senza tempo non va punito", () => {
    expect(decay(null, ORA)).toBe(1);
  });

  it("una data illeggibile vale 1, non NaN", () => {
    expect(decay("ieri", ORA)).toBe(1);
  });
});

describe("rawWeight", () => {
  it("un voto alto pesa più di un finito senza voto", () => {
    expect(rawWeight(riga({ status: "watched", rating: 9 }))).toBeGreaterThan(
      rawWeight(riga({ status: "watched" })),
    );
  });

  it("un voto basso porta il peso sotto zero anche se il titolo è finito", () => {
    expect(rawWeight(riga({ status: "watched", rating: 3 }))).toBeLessThan(0);
  });

  it("un voto di mezzo non sposta nulla", () => {
    expect(rawWeight(riga({ status: "watched", rating: 6 }))).toBe(
      rawWeight(riga({ status: "watched" })),
    );
  });

  it("le impression senza aperture sono uno skip, e non oltre il tetto", () => {
    expect(rawWeight(riga({ impressionSessions: 1 }))).toBe(-0.5);
    expect(rawWeight(riga({ impressionSessions: 2 }))).toBe(-1);
    expect(rawWeight(riga({ impressionSessions: 40 }))).toBe(-2);
  });

  it("una sola apertura cancella lo skip", () => {
    expect(rawWeight(riga({ impressionSessions: 10, opens: 1 }))).toBe(1);
  });

  it("le aperture ripetute contano al massimo tre volte", () => {
    expect(rawWeight(riga({ opens: 3 }))).toBe(3);
    expect(rawWeight(riga({ opens: 50 }))).toBe(3);
  });

  it("il dismiss è il segnale negativo più forte", () => {
    expect(rawWeight(riga({ dismisses: 1 }))).toBe(-4);
  });

  it("il seed pick vale come mezzo voto alto", () => {
    expect(rawWeight(riga({ isSeed: true }))).toBe(5);
  });

  it("abbandonato è negativo", () => {
    expect(rawWeight(riga({ status: "dropped" }))).toBe(-3);
  });
});

describe("weightOf", () => {
  it("applica il decadimento alla data più recente fra libreria ed eventi", () => {
    const vecchio = new Date(ORA.getTime() - 180 * 86400_000).toISOString();
    const row = riga({ status: "watched", lastWatchedAt: vecchio, lastEventAt: null });
    expect(weightOf(row, ORA)).toBeCloseTo(3, 2);
  });

  it("un evento recente su un titolo vecchio lo tiene vivo", () => {
    const vecchio = new Date(ORA.getTime() - 720 * 86400_000).toISOString();
    const row = riga({
      status: "watched",
      lastWatchedAt: vecchio,
      lastEventAt: ORA.toISOString(),
      opens: 1,
    });
    expect(weightOf(row, ORA)).toBeCloseTo(7, 5);
  });
});
