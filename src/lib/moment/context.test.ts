import { describe, expect, it } from "vitest";
import { contextAt } from "./context";

describe("contextAt", () => {
  it("legge l'ora di Roma, non quella del server", () => {
    // Le funzioni Vercel girano in UTC: 21:40Z del 21 giugno sono le 23:40 a Roma
    // (ora legale, +2). Con `getHours()` questo caso diceva "sera", non "notte fonda".
    const c = contextAt(new Date("2026-06-21T21:40:00Z"));
    expect(c.ora).toBe(23);
    expect(c.giorno).toBe(0); // domenica
    expect(c.mese).toBe(6);
  });

  it("segue anche il cambio di data dell'ora solare", () => {
    // 23:30Z del 6 gennaio = 00:30 del 7 a Roma (+1): cambia l'ora *e* il giorno
    const c = contextAt(new Date("2026-01-06T23:30:00Z"));
    expect(c.ora).toBe(0);
    expect(c.giorno).toBe(3); // mercoledì 7 gennaio 2026
    expect(c.mese).toBe(1);
  });

  it("porta con sé il meteo che gli viene passato", () => {
    expect(contextAt(new Date("2026-06-21T21:40:00Z"), "pioggia").meteo).toBe("pioggia");
    expect(contextAt(new Date("2026-06-21T21:40:00Z")).meteo).toBeNull();
  });
});
