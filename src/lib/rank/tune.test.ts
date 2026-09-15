import { describe, expect, it } from "vitest";
import { PESI_BASE } from "./affinity";
import {
  CAMPIONE_PIENO,
  MAX_FATTORE,
  MIN_FATTORE,
  toPesi,
  tuneWeights,
  type CampioneTaratura,
} from "./tune";
import type { Dimensione } from "./types";

/**
 * Il ciclo chiuso. Qui si controlla che impari **nella direzione giusta** e che non
 * possa impazzire: una taratura che sposta i pesi in modo sbagliato è peggio di nessuna
 * taratura, perché peggiora da sola giorno dopo giorno.
 */

function campione(
  esito: CampioneTaratura["esito"],
  valori: Partial<Record<Dimensione, number>>,
): CampioneTaratura {
  return { esito, valori };
}

/** N campioni identici, per fare massa senza scrivere venti righe. */
function tanti(n: number, c: CampioneTaratura): CampioneTaratura[] {
  return Array.from({ length: n }, () => ({ ...c, valori: { ...c.valori } }));
}

describe("tuneWeights", () => {
  it("senza campione restituisce i pesi di partenza", () => {
    expect(tuneWeights([]).pesi).toEqual(PESI_BASE);
  });

  it("con soli successi, o soli rifiuti, non impara niente", () => {
    // Serve il confronto fra i due gruppi: una media da sola non dice se quella
    // dimensione **distingue**.
    expect(tuneWeights(tanti(30, campione("forte", { generi: 1 }))).pesi).toEqual(
      PESI_BASE,
    );
    expect(tuneWeights(tanti(30, campione("rifiuto", { generi: 1 }))).pesi).toEqual(
      PESI_BASE,
    );
  });

  it("alza la dimensione che distingue e abbassa quella che non dice niente", () => {
    // Un utente che si fa convincere dai registi: quello che ha guardato aveva
    // `persone` alto, quello che ha ignorato no. I generi valgono uguale in entrambi i
    // gruppi, quindi su di lui non spiegano niente.
    const campioni = [
      ...tanti(CAMPIONE_PIENO, campione("forte", { persone: 0.9, generi: 0.5 })),
      ...tanti(CAMPIONE_PIENO, campione("rifiuto", { persone: 0.1, generi: 0.5 })),
    ];
    const { pesi, lift } = tuneWeights(campioni);
    expect(lift.persone!).toBeGreaterThan(0.5);
    expect(lift.generi!).toBeCloseTo(0, 5);
    expect(pesi.persone).toBeGreaterThan(PESI_BASE.persone);
    expect(pesi.generi).toBeLessThan(PESI_BASE.generi);
  });

  it("il tocco vale meno della visione", () => {
    // Due utenti identici, tranne che per il tipo di successo. Chi ha davvero guardato
    // deve spostare i pesi più di chi ha solo toccato la copertina.
    const rifiuti = tanti(CAMPIONE_PIENO, campione("rifiuto", { persone: 0 }));
    const forte = tuneWeights([
      ...tanti(CAMPIONE_PIENO, campione("forte", { persone: 1 })),
      ...rifiuti,
    ]);
    const lieve = tuneWeights([
      ...tanti(CAMPIONE_PIENO, campione("lieve", { persone: 1 })),
      ...rifiuti,
      // …e un solo campione forte in direzione opposta, per rendere le medie diverse
      ...tanti(1, campione("forte", { persone: 0 })),
    ]);
    expect(forte.pesi.persone).toBeGreaterThan(lieve.pesi.persone);
  });

  it("un campione piccolo sposta poco: la fiducia cresce coi successi", () => {
    const coppia = (n: number) =>
      tuneWeights([
        ...tanti(n, campione("forte", { persone: 1 })),
        ...tanti(n, campione("rifiuto", { persone: 0 })),
      ]).pesi.persone;
    expect(coppia(2)).toBeLessThan(coppia(CAMPIONE_PIENO));
  });

  it("non può inventare: ogni peso resta dentro i limiti", () => {
    // Dieci visioni tutte dello stesso regista non devono farsi mangiare il vettore.
    const estremo = tuneWeights([
      ...tanti(100, campione("forte", { persone: 1, generi: 0 })),
      ...tanti(100, campione("rifiuto", { persone: 0, generi: 1 })),
    ]);
    const somma = Object.values(estremo.pesi).reduce((a, b) => a + b, 0);
    expect(somma).toBeCloseTo(1, 2);
    for (const d of Object.keys(PESI_BASE) as Dimensione[]) {
      // I limiti valgono prima della rinormalizzazione; dopo, il rapporto fra i pesi
      // resta dentro lo stesso intervallo allargato dalla somma.
      const rapporto = estremo.pesi[d] / PESI_BASE[d];
      expect(rapporto).toBeGreaterThanOrEqual(MIN_FATTORE * 0.5);
      expect(rapporto).toBeLessThanOrEqual(MAX_FATTORE * 1.5);
    }
  });

  it("una dimensione che nessuno dei due gruppi dichiara resta dov'è", () => {
    const { pesi, lift } = tuneWeights([
      ...tanti(CAMPIONE_PIENO, campione("forte", { generi: 1 })),
      ...tanti(CAMPIONE_PIENO, campione("rifiuto", { generi: 0 })),
    ]);
    expect(lift.lingua).toBeUndefined();
    // `generi` sale, quindi la rinormalizzazione abbassa un po' tutte le altre: il
    // punto è che `lingua` non venga **azzerata**, non che resti identica.
    expect(pesi.lingua).toBeGreaterThan(PESI_BASE.lingua * 0.5);
  });
});

describe("toPesi", () => {
  it("una riga vuota, assente o corrotta torna ai pesi di partenza", () => {
    expect(toPesi(null)).toEqual(PESI_BASE);
    expect(toPesi({})).toEqual(PESI_BASE);
    expect(toPesi("non un oggetto")).toEqual(PESI_BASE);
    expect(toPesi([1, 2, 3])).toEqual(PESI_BASE);
  });

  it("un valore assurdo su una dimensione non contagia le altre", () => {
    const pesi = toPesi({ generi: 42, persone: 0.3 });
    expect(pesi.generi).toBe(PESI_BASE.generi);
    expect(pesi.persone).toBe(0.3);
  });
});
