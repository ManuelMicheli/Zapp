import { describe, expect, it } from "vitest";
import { CLOSE_RATIO, COMPLETE_RATIO, decide } from "@/lib/scrobble/rules";

const base = {
  previous: null,
  state: "playing" as const,
  at: "2026-09-09T21:00:00.000Z",
  positionMs: 60_000,
  durationMs: 2_400_000,
  closing: false,
};

describe("decide", () => {
  it("a inizio riproduzione aggiorna la sessione e non completa", () => {
    const r = decide(base);
    expect(r.completed).toBe(false);
    expect(r.session.positionMs).toBe(60_000);
    expect(r.progress).toEqual({ positionMs: 60_000, durationMs: 2_400_000 });
  });

  it("completa oltre il 90 per cento", () => {
    const r = decide({ ...base, positionMs: Math.round(2_400_000 * COMPLETE_RATIO) });
    expect(r.completed).toBe(true);
    expect(r.progress).toBeNull();
  });

  it("non completa appena sotto il 90 per cento", () => {
    const r = decide({ ...base, positionMs: Math.round(2_400_000 * COMPLETE_RATIO) - 1000 });
    expect(r.completed).toBe(false);
  });

  it("alla chiusura completa gia' dall'85 per cento", () => {
    const r = decide({ ...base, positionMs: 2_050_000, state: "stopped", closing: true });
    expect(r.completed).toBe(true);
  });

  it("alla chiusura, appena sotto l'85 per cento, non completa", () => {
    const r = decide({
      ...base,
      positionMs: Math.round(2_400_000 * CLOSE_RATIO) - 1000,
      state: "stopped",
      closing: true,
    });
    expect(r.completed).toBe(false);
  });

  it("alla chiusura sotto l'85 per cento salva solo il punto", () => {
    const r = decide({ ...base, positionMs: 1_000_000, state: "stopped", closing: true });
    expect(r.completed).toBe(false);
    expect(r.progress).toEqual({ positionMs: 1_000_000, durationMs: 2_400_000 });
  });

  it("senza durata non completa mai, ma il minuto lo salva", () => {
    const r = decide({ ...base, durationMs: null, positionMs: 9_000_000, closing: true });
    expect(r.completed).toBe(false);
    expect(r.progress).toEqual({ positionMs: 9_000_000, durationMs: null });
  });

  it("scarta un evento piu' vecchio dell'ultimo visto", () => {
    const r = decide({
      ...base,
      previous: {
        positionMs: 500_000,
        durationMs: 2_400_000,
        lastAt: "2026-09-09T21:05:00.000Z",
      },
      at: "2026-09-09T21:01:00.000Z",
    });
    expect(r.ignore).toBe("stale");
  });

  it("accetta il riavvolgimento se l'evento e' piu' recente", () => {
    const r = decide({
      ...base,
      previous: {
        positionMs: 500_000,
        durationMs: 2_400_000,
        lastAt: "2026-09-09T21:01:00.000Z",
      },
      at: "2026-09-09T21:02:00.000Z",
      positionMs: 120_000,
    });
    expect(r.ignore).toBeNull();
    expect(r.session.positionMs).toBe(120_000);
  });

  it("una posizione senza numero non scrive niente", () => {
    const r = decide({ ...base, positionMs: null });
    expect(r.ignore).toBe("no-duration");
  });
});
