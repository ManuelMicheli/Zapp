/**
 * Gli export di Letterboxd e TV Time si scaricano zippati. Aprirli qui evita
 * all'utente il passaggio in cui sbaglia file.
 *
 * Il tetto è sul **decompresso**, non sullo zip: uno zip da pochi kB può
 * dichiararsi gigabyte. La somma si controlla MENTRE si legge l'intestazione
 * dello zip, prima di decomprimere ogni voce: fflate passa `originalSize` dal
 * header al `filter` callback, ed è l'unico momento in cui una bomba si rifiuta
 * senza averla già gonfiata in memoria. Il filtro per estensione è applicato
 * **prima** del conteggio del budget: gli allegati non passano il filtro e
 * non consumano budget. La somma dopo `unzipSync` resta come seconda rete contro
 * un'intestazione che mente sulla dimensione.
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

/**
 * Lo stesso tetto per il percorso Storage, dove il file non passa dal corpo
 * della Server Action: li' il vincolo non è `bodySizeLimit` ma la memoria della
 * funzione, e 10 MB di tabelle estratte erano una promessa rotta — la pagina
 * dice 100 MB e un export Apple vero supera abbondantemente i dieci di
 * decompresso.
 */
export const MAX_UNZIPPED_STORAGE_BYTES = 50 * 1024 * 1024;

const UTILI = /\.(csv|json|tsv|txt)$/i;

/**
 * L'inizio dell'unico messaggio nostro che può uscire da qui: `actions.ts` lo
 * riconosce per prefisso e mostra il messaggio intero all'utente (il tetto
 * cambia con il percorso, quindi sta nel messaggio e non in una costante).
 * Tutto il resto viene da fflate, è in inglese e racconta il formato dello zip.
 */
export const ARCHIVIO_TROPPO_GRANDE = "Archivio troppo grande una volta aperto";

/** Il messaggio completo, col tetto vero di questa richiesta. */
function troppoGrande(bytes: number): Error {
  const mb = Math.round(bytes / 1024 / 1024);
  return new Error(`${ARCHIVIO_TROPPO_GRANDE} (oltre ${mb}MB).`);
}

/** Byte di decompresso ancora spendibili in questa richiesta. */
export interface UnzipBudget {
  rimanente: number;
  /** Il tetto di partenza: serve solo a scrivere il messaggio d'errore giusto. */
  iniziale: number;
}

export function nuovoBudget(bytes = MAX_UNZIPPED_BYTES): UnzipBudget {
  return { rimanente: bytes, iniziale: bytes };
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
      if (speso > budget.rimanente) throw troppoGrande(budget.iniziale);
      return true;
    },
  });
  let totale = 0;
  for (const content of Object.values(entries)) totale += content.length;
  // seconda rete: un'intestazione che mente sulla dimensione non passa comunque
  if (totale > budget.rimanente) throw troppoGrande(budget.iniziale);
  // il prossimo archivio della stessa richiesta parte da quello che resta
  budget.rimanente -= Math.max(speso, totale);
  return Object.entries(entries).map(([name, content]) => ({
    // il nome dentro lo zip ha il percorso: alle sorgenti serve solo il file
    name: name.split("/").pop() ?? name,
    text: strFromU8(content),
  }));
}
