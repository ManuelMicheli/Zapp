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

export function unzipSources(data: Uint8Array): SourceFile[] {
  const entries = unzipSync(data, {
    filter: (file) => UTILI.test(file.name) && !file.name.startsWith("__MACOSX/"),
  });
  let total = 0;
  for (const content of Object.values(entries)) total += content.length;
  if (total > MAX_UNZIPPED_BYTES) {
    throw new Error("Archivio troppo grande una volta aperto (oltre 10MB).");
  }
  return Object.entries(entries).map(([name, content]) => ({
    // il nome dentro lo zip ha il percorso: alle sorgenti serve solo il file
    name: name.split("/").pop() ?? name,
    text: strFromU8(content),
  }));
}
