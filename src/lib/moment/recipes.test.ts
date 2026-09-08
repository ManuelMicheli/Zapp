import { describe, expect, it } from "vitest";
import type { Meteo, MomentContext } from "./context";
import { MOMENTI, MOODS, moodByKey, pickMoment, titoloPerTipo } from "./recipes";

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

  it("il pomeriggio del weekend copre sabato e domenica dalle 12 alle 19", () => {
    for (const giorno of [0, 6]) {
      for (const ora of [12, 15, 18]) {
        expect(pickMoment(ctx({ giorno, ora })).key).toBe("pomeriggio-weekend");
      }
    }
    // e non sconfina: alle 11 e' ancora mattina, alle 19 comincia la sera
    expect(pickMoment(ctx({ giorno: 6, ora: 11 })).key).toBe("mattina-weekend");
    expect(pickMoment(ctx({ giorno: 6, ora: 19 })).key).not.toBe("pomeriggio-weekend");
    // nei feriali resta il pranzo, non il weekend
    expect(pickMoment(ctx({ giorno: 3, ora: 15 })).key).not.toBe("pomeriggio-weekend");
  });

  it("la pioggia batte il pomeriggio del weekend", () => {
    expect(pickMoment(ctx({ giorno: 6, ora: 15, meteo: "pioggia" })).key).toBe(
      "pioggia-pomeriggio",
    );
    expect(pickMoment(ctx({ giorno: 0, ora: 15, meteo: "pioggia" })).key).toBe(
      "domenica-pioggia",
    );
  });

  it("i feriali hanno un momento anche di mattina e di pomeriggio", () => {
    expect(pickMoment(ctx({ giorno: 3, ora: 9 })).key).toBe("mattina-feriale");
    expect(pickMoment(ctx({ giorno: 3, ora: 17 })).key).toBe("pomeriggio-feriale");
    // il pranzo resta suo, e il weekend non li vede
    expect(pickMoment(ctx({ giorno: 3, ora: 13 })).key).toBe("pausa-pranzo");
    expect(pickMoment(ctx({ giorno: 0, ora: 17 })).key).toBe("pomeriggio-weekend");
  });

  it("il caldo e il freddo cambiano il titolo, non solo la lista", () => {
    expect(pickMoment(ctx({ giorno: 2, ora: 15, meteo: "caldo" })).titolo).toBe(
      "Per un pomeriggio rinfrescante",
    );
    expect(pickMoment(ctx({ giorno: 2, ora: 15, meteo: "freddo" })).titolo).toBe(
      "Per un caldo pomeriggio",
    );
    expect(pickMoment(ctx({ giorno: 2, ora: 21, meteo: "freddo" })).titolo).toBe(
      "Per una serata al caldo",
    );
    expect(pickMoment(ctx({ giorno: 2, ora: 9, meteo: "freddo" })).titolo).toBe(
      "Per una mattina sotto le coperte",
    );
    // senza un termometro estremo resta la fascia, come prima
    expect(pickMoment(ctx({ giorno: 2, ora: 15, meteo: "sereno" })).key).toBe(
      "pomeriggio-feriale",
    );
  });

  it("la pioggia batte la temperatura, e i momenti con un nome battono entrambe", () => {
    // sotto la pioggia il termometro non conta: lo dice gia' meteoFromWmo, e l'ordine
    // dei momenti non deve contraddirlo
    expect(pickMoment(ctx({ giorno: 2, ora: 15, meteo: "pioggia" })).key).toBe(
      "pioggia-pomeriggio",
    );
    // l'aperitivo del venerdi' e il sabato sera restano loro anche col caldo
    expect(pickMoment(ctx({ giorno: 5, ora: 18, meteo: "caldo" })).key).toBe(
      "aperitivo-venerdi",
    );
    expect(pickMoment(ctx({ giorno: 6, ora: 21, meteo: "caldo" })).key).toBe(
      "sabato-sera",
    );
    // ma una fascia generica cede al termometro
    expect(pickMoment(ctx({ giorno: 0, ora: 15, meteo: "caldo" })).key).toBe(
      "caldo-pomeriggio",
    );
  });

  it('il ripiego "sempre" resta solo dove non c\'è niente da dire', () => {
    const scoperti = new Set<string>();
    for (let ora = 0; ora < 24; ora++) {
      for (let giorno = 0; giorno < 7; giorno++) {
        if (pickMoment({ ora, giorno, mese: 3, meteo: "sereno" }).key === "sempre") {
          scoperti.add(`g${giorno}-${ora}`);
        }
      }
    }
    // le uniche ore senza un momento suo: le prime del mattino, quando l'app non ha
    // niente di sensato da dire. Il resto della settimana e' coperto.
    expect([...scoperti].sort()).toEqual([
      "g0-5",
      "g0-6",
      "g0-7",
      "g1-5",
      "g2-5",
      "g3-5",
      "g4-5",
      "g5-5",
      "g6-5",
      "g6-6",
      "g6-7",
    ]);
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

describe("titoloPerTipo", () => {
  it('compone il titolo per scheda, senza dire "Film" sotto le serie', () => {
    const r = pickMoment(ctx({ giorno: 3, ora: 17 }));
    expect(titoloPerTipo(r, "all")).toBe("Per il pomeriggio");
    expect(titoloPerTipo(r, "movie")).toBe("Film per il pomeriggio");
    expect(titoloPerTipo(r, "tv")).toBe("Serie per il pomeriggio");
  });

  it("un mood non ha complemento: stesso titolo su tutte e tre le schede", () => {
    const mood = MOODS[0];
    for (const tipo of ["all", "movie", "tv"] as const) {
      expect(titoloPerTipo(mood, tipo)).toBe(mood.titolo);
    }
  });

  it("ogni momento ha un complemento, così nessuna scheda resta senza titolo suo", () => {
    for (const m of MOMENTI) {
      expect(m.recipe.complemento, m.recipe.key).toBeTruthy();
      expect(titoloPerTipo(m.recipe, "movie").startsWith("Film per ")).toBe(true);
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
