"use server";

import { getViewer } from "@/lib/auth/viewer";
import { GIORNI_ATTESA } from "./richieste";
import { segnaRichiesta } from "./richieste-store";

/**
 * Segna che il viewer ha appena chiesto l'export a `platformKey` (bottone
 * "L'ho richiesta" di `/import/richiesta/[piattaforma]`). Risolve l'utente da
 * solo con `getViewer()`, non lo riceve dal chiamante: una Server Action è un
 * endpoint HTTP come un altro, e un `userId` passato dal client avrebbe
 * permesso di segnare una richiesta per conto di chiunque.
 *
 * `platformKey` deve essere una delle chiavi di `GIORNI_ATTESA` (le uniche
 * quattro con una pagina di richiesta): qualunque altra stringa non scrive
 * niente, invece di aprire `import_requests` a valori arbitrari.
 */
export async function segnaRichiestaPiattaforma(platformKey: string): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer) return false;
  if (!(platformKey in GIORNI_ATTESA)) return false;
  return segnaRichiesta(viewer.id, platformKey);
}
