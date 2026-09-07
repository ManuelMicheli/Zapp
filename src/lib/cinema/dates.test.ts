import { describe, expect, it } from "vitest";
import {
  countdownParts,
  formatCountdown,
  formatShowingDate,
  formatTime,
  minutesUntil,
  nextDay,
  nextDays,
  planPhase,
  relativeDayLabel,
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
    expect(days.map((d) => d.date)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(days.map((d) => d.label)).toEqual(["Oggi", "Domani", "Dom 6"]);
  });

  it("etichetta il giorno dello spettacolo rispetto a oggi", () => {
    expect(relativeDayLabel("2026-09-07T21:00:00+02:00", "2026-09-07")).toBe("oggi");
    expect(relativeDayLabel("2026-09-08T00:30:00+02:00", "2026-09-07")).toBe("domani");
    expect(relativeDayLabel("2026-09-09T21:00:00+02:00", "2026-09-07")).toBe("mer 9");
  });

  it("passa al giorno successivo anche nel weekend dell'ora legale", () => {
    expect(nextDay("2026-10-24")).toBe("2026-10-25");
    expect(nextDay("2026-10-25")).toBe("2026-10-26");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });

  it("formatta data e ora dello spettacolo", () => {
    expect(formatShowingDate("2026-09-10T21:00:00+02:00")).toBe("Gio 10 set · 21:00");
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

describe("countdownParts", () => {
  it("spezza il conto alla rovescia in ore e minuti per le cifre grandi", () => {
    expect(countdownParts(115)).toEqual({ hours: 1, minutes: 55 });
    expect(countdownParts(120)).toEqual({ hours: 2, minutes: 0 });
    expect(countdownParts(25)).toEqual({ hours: 0, minutes: 25 });
    expect(countdownParts(0)).toEqual({ hours: 0, minutes: 0 });
    expect(countdownParts(-30)).toBe(null);
  });
});

describe("planPhase", () => {
  const start = "2026-09-07T21:00:00+02:00";
  const at = (iso: string) => new Date(iso).getTime();

  it("tiene il banner fino a un'ora dopo l'inizio", () => {
    expect(planPhase(start, 105, at("2026-09-07T18:00:00+02:00"))).toBe("upcoming");
    expect(planPhase(start, 105, at("2026-09-07T21:59:00+02:00"))).toBe("upcoming");
    expect(planPhase(start, 105, at("2026-09-07T22:01:00+02:00"))).toBe("during");
  });

  it("chiede com'e' andata a film finito (pubblicita' inclusa)", () => {
    // 21:00 + 20 min di pubblicita' + 105 min = 23:05
    expect(planPhase(start, 105, at("2026-09-07T23:04:00+02:00"))).toBe("during");
    expect(planPhase(start, 105, at("2026-09-07T23:06:00+02:00"))).toBe("ended");
    expect(planPhase(start, 105, at("2026-09-10T09:00:00+02:00"))).toBe("ended");
  });

  it("senza runtime usa due ore, e dopo una settimana lascia perdere", () => {
    expect(planPhase(start, null, at("2026-09-07T23:15:00+02:00"))).toBe("during");
    expect(planPhase(start, null, at("2026-09-07T23:25:00+02:00"))).toBe("ended");
    expect(planPhase(start, 105, at("2026-09-15T09:00:00+02:00"))).toBe("gone");
    expect(planPhase("non una data", 105)).toBe("gone");
  });
});
