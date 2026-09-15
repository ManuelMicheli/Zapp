"use server";

import { createClient } from "@/lib/supabase/server";
import { GIORNI_ATTESA } from "./richieste";
import { segnaRichiesta } from "./richieste-store";

/**
 * Segna che l'utente ha appena chiesto l'export a `platformKey` (bottone
 * "L'ho richiesta" di `/import/richiesta/[piattaforma]`). Risolve l'utente da
 * solo, non lo riceve dal chiamante: una Server Action è un endpoint HTTP
 * come un altro, e un `userId` passato dal client avrebbe permesso di
 * segnare una richiesta per conto di chiunque. `getUser()`, non `getViewer()`:
 * è una scrittura, e la regola del progetto (`docs/architecture/auth-routing.md`)
 * riserva `getViewer()` alle letture — verifica solo la firma del token in
 * locale, senza consultare Supabase Auth, quindi una sessione revocata
 * resterebbe valida qui fino a un'ora.
 *
 * `platformKey` deve essere una delle chiavi di `GIORNI_ATTESA` (le uniche
 * quattro con una pagina di richiesta): qualunque altra stringa non scrive
 * niente, invece di aprire `import_requests` a valori arbitrari. `hasOwn`,
 * non `in`: `in` risale alla catena dei prototipi, quindi `"toString"` o
 * `"constructor"` lo passerebbero come chiavi valide — `GIORNI_ATTESA[key]`
 * varrebbe la funzione ereditata da `Object.prototype`, non `undefined`, e
 * il `?? GIORNI_ATTESA_DEFAULT` di `stimaArrivo` non scatterebbe: la somma
 * `giorno + giorniAttesa` diventa `NaN`, la data risulta invalida e
 * `toISOString()` la fa esplodere con un errore 500.
 */
export async function segnaRichiestaPiattaforma(platformKey: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (!Object.hasOwn(GIORNI_ATTESA, platformKey)) return false;
  return segnaRichiesta(user.id, platformKey);
}
