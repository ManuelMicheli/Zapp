/**
 * Gli export di Letterboxd e TV Time si scaricano zippati. Aprirli qui evita
 * all'utente il passaggio in cui sbaglia file.
 *
 * Il tetto è sul **decompresso**, non sullo zip: uno zip da pochi kB può
 * dichiararsi gigabyte. La somma si controlla MENTRE si legge l'intestazione
 * dello zip, prima di decomprimere ogni voce: fflate passa `originalSize` dal
 * header al `filter` callback, ed è l'unico momento in cui una bomba si rifiuta
 * senza averla già gonfiata in memoria. La somma dopo `unzipSync` resta come
 * seconda rete contro un'intestazione che mente sulla dimensione.
 *
 * Il budget è **della richiesta**, non del singolo archivio: `parseImportFiles`
 * accetta più file per volta, quindi un tetto per archivio si aggirava caricando
 * N zip nella stessa richiesta. Il chiamante crea un `UnzipBudget` e lo passa a
 * ogni apertura: tutte consumano dallo stesso residuo.
 */

import { strFromU8, unzipSync } from "fflate";
import type { SourceFile } from "./sources/types";

/** Somma massima dei file estratti in una richiesta di import. */
export const MAX_UNZIPPED_BYTES = 10 * 1024 * 1024;

const UTILI = /\.(csv|json|txt)$/i;

/**
 * L'unico messaggio nostro che può uscire da qui: `actions.ts` lo riconosce per
 * confronto e mostra solo questo all'utente. Tutto il resto viene da fflate, è
 * in inglese e racconta il formato dello zip.
 */
export const ARCHIVIO_TROPPO_GRANDE =
  "Archivio troppo grande una volta aperto (oltre 10MB).";

/** Byte di decompresso ancora spendibili in questa richiesta. */
export interface UnzipBudget {
  rimanente: number;
}

export function nuovoBudget(bytes = MAX_UNZIPPED_BYTES): UnzipBudget {
  return { rimanente: bytes };
}

export function unzipSources(
  data: Uint8Array,
  budget: UnzipBudget = nuovoBudget(),
): SourceFile[] {
  let speso = 0;
  const entries = unzipSync(data, {
    filter: (file) => {
      if (!UTILI.test(file.name) || file.name.startsWith("__MACOSX/")) return false;
      // `originalSize` sta nell'intestazione dello zip e si legge PRIMA di
      // decomprimere: e' l'unico punto in cui una bomba si rifiuta senza
      // averla gia' gonfiata in memoria.
      //
      // Si conta il massimo fra dichiarato e compresso perche' i due campi sono
      // indipendenti e nessuno li confronta: una voce STORED (metodo 0) fflate
      // la materializza tagliando `size` byte dal file, quindi un
      // `originalSize: 0` con dentro un mega passava contando zero — e una sola
      // central directory puo' nominare mille volte lo stesso header.
      speso += Math.max(file.originalSize, file.size);
      if (speso > budget.rimanente) throw new Error(ARCHIVIO_TROPPO_GRANDE);
      return true;
    },
  });
  let totale = 0;
  for (const content of Object.values(entries)) totale += content.length;
  // seconda rete: un'intestazione che mente sulla dimensione non passa comunque
  if (totale > budget.rimanente) throw new Error(ARCHIVIO_TROPPO_GRANDE);
  // il prossimo archivio della stessa richiesta parte da quello che resta
  budget.rimanente -= Math.max(speso, totale);
  return Object.entries(entries).map(([name, content]) => ({
    // il nome dentro lo zip ha il percorso: alle sorgenti serve solo il file
    name: name.split("/").pop() ?? name,
    text: strFromU8(content),
  }));
}
