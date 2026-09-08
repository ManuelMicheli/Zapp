/**
 * Finestra scorrevole in memoria per i limiti di frequenza.
 *
 * Sta in un modulo suo, **senza `server-only`**, perche' Vitest non puo'
 * importare un modulo che lo dichiara: `rate-limit.ts` tiene l'input/output
 * (Upstash, variabili d'ambiente, orologio) e qui resta la sola decisione, che
 * si puo' provare con dei numeri.
 */
export interface Finestra {
  timestamps: number[];
}

/**
 * true = consentito. Muta la finestra: toglie i tentativi usciti dalla
 * finestra e aggiunge `ora` se il tentativo passa.
 */
export function consenti(
  finestra: Finestra,
  ora: number,
  limite: number,
  finestraSec: number,
): boolean {
  const taglio = ora - finestraSec * 1000;
  finestra.timestamps = finestra.timestamps.filter((t) => t > taglio);
  // Un tentativo respinto **non** entra nella finestra: se ci entrasse, chi
  // insiste si allungherebbe da solo la punizione oltre la finestra dichiarata.
  if (finestra.timestamps.length >= limite) return false;
  finestra.timestamps.push(ora);
  return true;
}

/**
 * Toglie dalla mappa le finestre ormai esaurite e, se le chiavi restano troppe,
 * riparte da zero: perdere lo stato del limitatore vale molto meno che tenere
 * in piedi il processo. Ritorna quante chiavi ha tolto.
 */
export function spazza(
  mappa: Map<string, Finestra>,
  ora: number,
  finestraSec: number,
  maxChiavi: number,
): number {
  const taglio = ora - finestraSec * 1000;
  let tolte = 0;
  for (const [chiave, finestra] of mappa) {
    const ultimo = finestra.timestamps[finestra.timestamps.length - 1];
    if (ultimo === undefined || ultimo <= taglio) {
      mappa.delete(chiave);
      tolte += 1;
    }
  }
  if (mappa.size > maxChiavi) {
    tolte += mappa.size;
    mappa.clear();
  }
  return tolte;
}
