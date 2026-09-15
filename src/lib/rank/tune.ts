import { PESI_BASE } from "./affinity";
import type { Dimensione, PesiGusto } from "./types";

/**
 * La taratura per utente: Zapp che impara **su quali leve questa persona si muove**.
 *
 * Due utenti con lo stesso gusto non si convincono allo stesso modo. Uno segue i
 * registi e guarderebbe qualunque cosa firmata Villeneuve; un altro non sa chi sia
 * Villeneuve ma non esce mai dalla fantascienza; un terzo apre solo quello che trova su
 * Netflix perché è l'unico abbonamento che paga. I pesi di `PESI_BASE` sono la media di
 * tutti e tre, cioè il ritratto di nessuno.
 *
 * Funzione **pura**, come `buildTasteProfile` della fase A e `zappScore` della fase B:
 * i numeri discutibili stanno tutti qui e si leggono in un test, il resto è idraulica
 * (`tune-run.ts`).
 *
 * ## Come impara
 *
 * Per ogni dimensione si confronta quanto valeva **sui titoli che l'utente ha poi
 * guardato** con quanto valeva **su quelli che si è lasciato scorrere davanti senza
 * aprirli**. Se i titoli che hanno funzionato avevano `persone` alto e quelli ignorati
 * no, allora per questa persona i nomi contano: il peso di `persone` sale.
 *
 *     lift(d) = mediaPesata(d sui successi) − mediaPesata(d sui rifiuti)
 *     peso(d) = PESI_BASE[d] × (1 + K · lift(d) · fiducia)
 *
 * Non è una rete e non è una regressione: è la differenza fra due medie, che con
 * qualche decina di campioni è l'unica cosa onesta che si possa misurare. Vale anche
 * che si legge — `pesi.persone = 0,31` si capisce, un vettore di trecento numeri no, e
 * qui sotto ogni copertina c'è scritto **perché** è lì.
 */

/** Quanto forte può spingere una dimensione che discrimina perfettamente. */
export const K = 1;
/** Successi oltre i quali ci si fida del campione per intero. */
export const CAMPIONE_PIENO = 20;
/**
 * Quanto un peso può allontanarsi dal suo valore di partenza.
 *
 * La taratura può **spostare**, mai inventare: senza questi limiti bastavano dieci
 * visioni tutte dello stesso regista perché `persone` mangiasse l'intero vettore e
 * l'utente si ritrovasse una home di un uomo solo.
 */
export const MIN_FATTORE = 0.4;
export const MAX_FATTORE = 2;

/** Quanto pesa un esito, sui due livelli decisi con l'utente il 2026-09-15. */
export const PESO_ESITO = {
  /** L'ha messo in libreria, iniziato, finito, o votato bene: questo conta. */
  forte: 1,
  /**
   * Ha toccato la copertina, aperto il trailer, aperto la piattaforma. Conta poco
   * apposta: premiare il tocco vuol dire premiare le locandine appariscenti e i titoli
   * già famosi, cioè trasformare il motore in una macchina da clickbait. Serve solo a
   * distinguere "non gliene è importato niente" da "l'ha guardato e ci ha pensato su".
   */
  lieve: 0.3,
} as const;

export type Esito = keyof typeof PESO_ESITO | "rifiuto";

/** Un titolo proposto e cosa ne è stato, coi valori delle dimensioni già calcolati. */
export interface CampioneTaratura {
  esito: Esito;
  /** Il valore di ogni dimensione per quel titolo, da `valoreDimensione`. */
  valori: Partial<Record<Dimensione, number>>;
}

export interface Taratura {
  pesi: PesiGusto;
  /** Quanti successi hanno contribuito: sotto `CAMPIONE_PIENO` la spinta è ridotta. */
  successi: number;
  rifiuti: number;
  /** Il `lift` misurato per dimensione, prima dei limiti. Serve solo a capire. */
  lift: Partial<Record<Dimensione, number>>;
}

const DIMENSIONI = Object.keys(PESI_BASE) as Dimensione[];

/** Media pesata di una dimensione su un gruppo, o `null` se nessuno la dichiara. */
function media(
  campioni: readonly { peso: number; valore: number | undefined }[],
): number | null {
  let somma = 0;
  let peso = 0;
  for (const c of campioni) {
    if (c.valore === undefined || !Number.isFinite(c.valore)) continue;
    somma += c.valore * c.peso;
    peso += c.peso;
  }
  return peso > 0 ? somma / peso : null;
}

/**
 * I pesi tarati su questo utente. Senza campione, o senza abbastanza successi, tornano
 * quelli di partenza: **un utente nuovo non deve mai pagare l'esperimento di un altro.**
 */
export function tuneWeights(campioni: readonly CampioneTaratura[]): Taratura {
  const successi = campioni.filter((c) => c.esito !== "rifiuto");
  const rifiuti = campioni.filter((c) => c.esito === "rifiuto");
  const lift: Partial<Record<Dimensione, number>> = {};

  if (successi.length === 0 || rifiuti.length === 0) {
    return {
      pesi: { ...PESI_BASE },
      successi: successi.length,
      rifiuti: rifiuti.length,
      lift,
    };
  }

  const fiducia = Math.min(1, successi.length / CAMPIONE_PIENO);
  const grezzi: Partial<Record<Dimensione, number>> = {};

  for (const d of DIMENSIONI) {
    const buoni = media(
      successi.map((c) => ({
        peso: PESO_ESITO[c.esito as keyof typeof PESO_ESITO],
        valore: c.valori[d],
      })),
    );
    const cattivi = media(rifiuti.map((c) => ({ peso: 1, valore: c.valori[d] })));
    // Una dimensione che nessuno dei due gruppi dichiara non ha niente da insegnare:
    // resta al suo peso di partenza invece di venire azzerata.
    if (buoni === null || cattivi === null) {
      grezzi[d] = PESI_BASE[d];
      continue;
    }
    const l = buoni - cattivi;
    lift[d] = Number(l.toFixed(4));
    const fattore = Math.min(MAX_FATTORE, Math.max(MIN_FATTORE, 1 + K * l * fiducia));
    grezzi[d] = PESI_BASE[d] * fattore;
  }

  // Rinormalizzati a somma 1: i pesi sono quote, non valori assoluti, e `affinity` li
  // rinormalizza comunque sulle dimensioni presenti — ma una riga di database che somma
  // a 1,37 è una riga che nessuno può leggere.
  const totale = DIMENSIONI.reduce((a, d) => a + (grezzi[d] ?? 0), 0);
  const pesi = {} as PesiGusto;
  for (const d of DIMENSIONI) {
    pesi[d] = totale > 0 ? Number(((grezzi[d] ?? 0) / totale).toFixed(4)) : PESI_BASE[d];
  }

  return { pesi, successi: successi.length, rifiuti: rifiuti.length, lift };
}

/**
 * Da riga di database a pesi utilizzabili. Qualunque cosa storta — colonna vuota,
 * dimensione mancante, numero assurdo — torna al peso di partenza per quella
 * dimensione: una taratura corrotta non deve poter spegnere il motore.
 */
export function toPesi(raw: unknown): PesiGusto {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...PESI_BASE };
  const riga = raw as Record<string, unknown>;
  const pesi = {} as PesiGusto;
  for (const d of DIMENSIONI) {
    const v = riga[d];
    pesi[d] =
      typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1 ? v : PESI_BASE[d];
  }
  return pesi;
}
