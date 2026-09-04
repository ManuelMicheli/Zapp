import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatShowingDate,
  formatTime,
  minutesUntil,
  nextDays,
  romeDateString,
  romeIso,
} from "./dates";

describe("dates (Europe/Rome)", () => {
  it("ricava la data locale di Roma", () => {
    // 23:30 UTC del 4 settembre = 01:30 del 5 a Roma (CEST)
    expect(romeDateString(new Date("2026-09-04T23:30:00Z"))).toBe("2026-09-05");
  });

  it("costruisce l'ISO con l'offset giusto (estate/inverno)", () => {
    expect(romeIso("2026-09-04", "21:00")).toBe("2026-09-04T21:00:00+02:00");
    expect(romeIso("2026-01-10", "21:00")).toBe("2026-01-10T21:00:00+01:00");
  });

  it("elenca i prossimi giorni con etichette italiane", () => {
    const days = nextDays(3, new Date("2026-09-04T10:00:00Z"));
    expect(days.map((d) => d.date)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(days.map((d) => d.label)).toEqual(["Oggi", "Domani", "Dom 6"]);
  });

  it("formatta data e ora dello spettacolo", () => {
    expect(formatShowingDate("2026-09-10T21:00:00+02:00")).toBe(
      "Gio 10 set · 21:00"
    );
    expect(formatTime("2026-09-10T21:05:00+02:00")).toBe("21:05");
  });

  it("calcola minuti e countdown", () => {
    const now = new Date("2026-09-04T18:00:00+02:00").getTime();
    expect(minutesUntil("2026-09-04T20:10:00+02:00", now)).toBe(130);
    expect(formatCountdown(130)).toBe("tra 2 h 10");
    expect(formatCountdown(120)).toBe("tra 2 h");
    expect(formatCountdown(35)).toBe("tra 35 min");
    expect(formatCountdown(0)).toBe("adesso");
    expect(formatCountdown(-20)).toBe("iniziato");
  });
});
