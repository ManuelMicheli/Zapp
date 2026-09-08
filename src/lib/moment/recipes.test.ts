import { describe, expect, it } from "vitest";
import type { Meteo, MomentContext } from "./context";
import { MOODS, moodByKey, pickMoment } from "./recipes";

function ctx(p: Partial<MomentContext>): MomentContext {
  return { ora: 21, giorno: 2, mese: 5, meteo: null, ...p };
}

describe("pickMoment", () => {
  it("la domenica di pioggia batte sia la sera di pioggia sia la sera generica", () => {
    expect(pickMoment(ctx({ giorno: 0, ora: 21, meteo: "pioggia" })).key).toBe(
      "domenica-pioggia",
    );
  });

  it("il meteo forte batte la fascia oraria", () => {
    expect(pickMoment(ctx({ giorno: 2, ora: 21, meteo: "pioggia" })).key).toBe(
      "pioggia-sera",
    );
    expect(pickMoment(ctx({ giorno: 2, ora: 21, meteo: null })).key).toBe("sera");
  });

  it("la notte fonda scavalca la mezzanotte", () => {
    expect(pickMoment(ctx({ ora: 23 })).key).toBe("notte-fonda");
    expect(pickMoment(ctx({ ora: 2 })).key).toBe("notte-fonda");
    expect(pickMoment(ctx({ ora: 5 })).key).not.toBe("notte-fonda");
  });

  it("l'aperitivo è del venerdì, non di tutti i giorni", () => {
    expect(pickMoment(ctx({ giorno: 5, ora: 18 })).key).toBe("aperitivo-venerdi");
    expect(pickMoment(ctx({ giorno: 4, ora: 18 })).key).not.toBe("aperitivo-venerdi");
  });

  it("c'è sempre un vincitore, per qualunque combinazione", () => {
    const meteo: (Meteo | null)[] = [
      null,
      "pioggia",
      "neve",
      "sereno",
      "caldo",
      "freddo",
    ];
    for (let ora = 0; ora < 24; ora++) {
      for (let giorno = 0; giorno < 7; giorno++) {
        for (let mese = 1; mese <= 12; mese++) {
          for (const m of meteo) {
            const r = pickMoment({ ora, giorno, mese, meteo: m });
            expect(r.titolo.length).toBeGreaterThan(0);
            expect(r.generi.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("moodByKey", () => {
  it("riconosce solo i mood dell'elenco", () => {
    expect(moodByKey("leggero")?.titolo).toBe("Qualcosa di leggero");
    expect(moodByKey("../../etc/passwd")).toBeNull();
    expect(moodByKey(null)).toBeNull();
    expect(moodByKey(42)).toBeNull();
  });

  it("ogni mood ha pillola, titolo e almeno un genere", () => {
    for (const m of MOODS) {
      expect(m.pillola.length).toBeGreaterThan(0);
      expect(m.titolo.length).toBeGreaterThan(0);
      expect(m.generi.length).toBeGreaterThan(0);
    }
    expect(new Set(MOODS.map((m) => m.key)).size).toBe(MOODS.length);
  });
});
