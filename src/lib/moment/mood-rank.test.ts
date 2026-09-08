import { describe, expect, it } from "vitest";
import { ordinaPerFama, pesoFama, SPINTA_GUSTO } from "./mood-rank";
import { picksFor } from "./mood-picks";
import { MOODS } from "./recipes";

describe("pesoFama", () => {
  it("senza gusto è la pura fama", () => {
    expect(pesoFama(40000, 0)).toBeGreaterThan(pesoFama(4000, 0));
    expect(pesoFama(4000, 0)).toBeGreaterThan(pesoFama(400, 0));
  });

  it("il gusto ritocca fra vicini, non ribalta la classifica", () => {
    // stessa fama, gusto diverso: passa avanti chi somiglia
    expect(pesoFama(10000, 1)).toBeGreaterThan(pesoFama(10000, 0));
    // il doppio dei voti non si recupera nemmeno con l'affinità massima: la spinta
    // riordina i vicini, non ribalta la classifica
    expect(pesoFama(20000, 0)).toBeGreaterThan(pesoFama(10000, 1));
    expect(pesoFama(40000, 0)).toBeGreaterThan(pesoFama(4000, 1));
  });

  it("regge un profilo vuoto e valori fuori scala", () => {
    expect(Number.isFinite(pesoFama(0, 0))).toBe(true);
    expect(pesoFama(1000, 5)).toBe(pesoFama(1000, 1));
    expect(pesoFama(1000, -3)).toBe(pesoFama(1000, 0));
  });
});

describe("ordinaPerFama", () => {
  it("mette in testa i più visti", () => {
    const out = ordinaPerFama([
      { voti: 900, punteggio: 0.9, nome: "poco visto" },
      { voti: 30000, punteggio: 0.1, nome: "famoso" },
      { voti: 5000, punteggio: 0.5, nome: "mezzo" },
    ]);
    expect(out.map((o) => o.nome)).toEqual(["famoso", "mezzo", "poco visto"]);
  });

  it("non modifica l'array che riceve", () => {
    const dentro = [
      { voti: 10, punteggio: 0 },
      { voti: 900, punteggio: 0 },
    ];
    ordinaPerFama(dentro);
    expect(dentro[0].voti).toBe(10);
  });

  it("a parità di peso l'ordine è stabile fra due chiamate", () => {
    const l = [
      { voti: 1000, punteggio: 0.5, nome: "a" },
      { voti: 1000, punteggio: 0.5, nome: "b" },
    ];
    expect(ordinaPerFama(l).map((x) => x.nome)).toEqual(
      ordinaPerFama(l).map((x) => x.nome),
    );
  });
});

describe("le liste curate", () => {
  it("ogni mood ne ha almeno venti, tutte con locandina e voti veri", () => {
    for (const m of MOODS) {
      const picks = picksFor(m.key);
      expect(picks.length, m.key).toBeGreaterThanOrEqual(20);
      for (const p of picks) {
        expect(p.posterPath, `${m.key}/${p.title}`).toBeTruthy();
        // sotto i mille voti non e' "fra i piu' visti"
        expect(p.voti, `${m.key}/${p.title}`).toBeGreaterThan(1000);
        expect(p.genreIds.length, `${m.key}/${p.title}`).toBeGreaterThan(0);
      }
    }
  });

  it("nessun doppione dentro un mood", () => {
    for (const m of MOODS) {
      const chiavi = picksFor(m.key).map((p) => `${p.mediaType}-${p.id}`);
      expect(new Set(chiavi).size, m.key).toBe(chiavi.length);
    }
  });

  it("ogni mood ha anche qualche serie, se no la scheda Serie TV resta vuota", () => {
    for (const m of MOODS) {
      const serie = picksFor(m.key).filter((p) => p.mediaType === "tv");
      expect(serie.length, m.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("un momento non ha liste curate: la sua fila resta generata", () => {
    expect(picksFor("domenica-pioggia")).toEqual([]);
    expect(picksFor("non-esiste")).toEqual([]);
  });

  it("la spinta del gusto resta una spinta", () => {
    expect(SPINTA_GUSTO).toBeLessThanOrEqual(1);
  });
});
