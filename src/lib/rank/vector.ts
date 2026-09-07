import type { Dimensione } from "./types";
import type { Tables } from "@/types/database";

/**
 * Da riga di `user_taste` (fase A) a vettore confrontabile.
 *
 * Ogni dimensione viene divisa per il **suo massimo**, non per la somma: i generi in
 * `user_taste` non sommano a 1 (un titolo ne ha più d'uno), quindi la somma non è una
 * scala. Diviso per il massimo, una quota si legge come "quanto questo valore è vicino
 * al tuo preferito", da 0 a 1 — e i rifiuti restano negativi.
 */

/** Massa oltre la quale il profilo è considerato pieno: ~dieci titoli finiti e amati. */
export const MASSA_PIENA = 60;
/** Sotto questa massa l'affinità serve a ordinare, ma non si mostra a nessuno. */
export const MASSA_MINIMA = 20;

export type Mappa = Map<string, number>;

export interface TasteVector {
  generi: Mappa;
  decenni: Mappa;
  provider: Mappa;
  persone: Mappa;
  tipo: Mappa;
  runtime: Mappa;
  lingua: Mappa;
  /** 0..1: quanto ci si può fidare di questo profilo. */
  fiducia: number;
  /** `true` quando la percentuale si può mostrare all'utente. */
  abbastanza: boolean;
}

const VUOTO = (): Mappa => new Map();

/** Divide per il massimo assoluto: dopo, il valore più forte vale 1 (o −1). */
function normalizza(raw: unknown): Mappa {
  const out: Mappa = new Map();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const voci = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
  );
  if (voci.length === 0) return out;
  const massimo = Math.max(...voci.map(([, v]) => Math.abs(v)));
  if (massimo <= 0) return out;
  for (const [k, v] of voci) out.set(k, v / massimo);
  return out;
}

export function toTasteVector(row: Tables<"user_taste"> | null): TasteVector {
  if (!row) {
    return {
      generi: VUOTO(),
      decenni: VUOTO(),
      provider: VUOTO(),
      persone: VUOTO(),
      tipo: VUOTO(),
      runtime: VUOTO(),
      lingua: VUOTO(),
      fiducia: 0,
      abbastanza: false,
    };
  }
  const massa = row.massa ?? 0;
  return {
    generi: normalizza(row.generi),
    decenni: normalizza(row.decenni),
    provider: normalizza(row.provider),
    persone: normalizza(row.persone),
    tipo: normalizza(row.tipo),
    runtime: normalizza(row.runtime),
    lingua: normalizza(row.lingua),
    fiducia: Math.min(1, Math.max(0, massa / MASSA_PIENA)),
    abbastanza: massa >= MASSA_MINIMA,
  };
}

/** Accesso per nome, per non ripetere sette `switch` in giro. */
export function mappaDi(v: TasteVector, d: Dimensione): Mappa {
  return v[d];
}
