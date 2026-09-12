/**
 * Gli export di Letterboxd e TV Time si scaricano zippati. Aprirli qui evita
 * all'utente il passaggio in cui sbaglia file.
 *
 * Il tetto è sul **decompresso**, non sullo zip: uno zip da pochi kB può
 * espandersi in gigabyte, ed è l'unico modo per far male al server da questa
 * pagina. `unzipSync` decomprime tutto in memoria, quindi la somma si controlla
 * subito dopo, prima di decodificare il testo.
 */

import { strFromU8, unzipSync } from "fflate";
import type { SourceFile } from "./sources/types";

/** Somma massima dei file estratti da un archivio. */
export const MAX_UNZIPPED_BYTES = 10 * 1024 * 1024;

const UTILI = /\.(csv|json|txt)$/i;
const TROPPO_GRANDE = "Archivio troppo grande una volta aperto (oltre 10MB).";

export function unzipSources(data: Uint8Array): SourceFile[] {
  let dichiarato = 0;
  const entries = unzipSync(data, {
    filter: (file) => {
      if (!UTILI.test(file.name) || file.name.startsWith("__MACOSX/")) return false;
      // `originalSize` sta nell'intestazione dello zip e si legge PRIMA di
      // decomprimere: e' l'unico punto in cui una bomba si rifiuta senza
      // averla gia' gonfiata in memoria.
      dichiarato += file.originalSize;
      if (dichiarato > MAX_UNZIPPED_BYTES) throw new Error(TROPPO_GRANDE);
      return true;
    },
  });
  let totale = 0;
  for (const content of Object.values(entries)) totale += content.length;
  // seconda rete: un'intestazione che mente sulla dimensione non passa comunque
  if (totale > MAX_UNZIPPED_BYTES) throw new Error(TROPPO_GRANDE);
  return Object.entries(entries).map(([name, content]) => ({
    // il nome dentro lo zip ha il percorso: alle sorgenti serve solo il file
    name: name.split("/").pop() ?? name,
    text: strFromU8(content),
  }));
}
