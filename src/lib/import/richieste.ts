/**
 * Quanto ci mette una piattaforma a evadere la richiesta di accesso ai dati: i
 * giorni tipici dei rispettivi portali privacy, gli stessi che
 * `src/lib/platforms/azioni.ts` mostra all'utente in parole ("3-7 giorni", "fino
 * a 30 giorni"). Una chiave che non è qui (mai dovrebbe succedere: sono le
 * uniche piattaforme con una richiesta) vale trenta giorni, il caso peggiore fra
 * quelli noti.
 *
 * Pura e senza `import "server-only"` apposta: sta in un file suo perché la usa
 * anche Vitest, che non gira in ambiente server (come per
 * `src/lib/platforms/keys.ts`). La parte server-only (scrittura e lettura di
 * `import_requests`) sta in `./richieste-store.ts`, che importa da qui.
 */
export const GIORNI_ATTESA: Record<string, number> = {
  "apple-tv": 7,
  "prime-video": 5,
  "disney-plus": 30,
  now: 30,
};

const GIORNI_ATTESA_DEFAULT = 30;

/**
 * La data (solo giorno, ISO `YYYY-MM-DD`) in cui l'export dovrebbe essere
 * pronto, in **UTC**: con l'ora locale una richiesta fatta la sera d'estate
 * slitta di un giorno e la stima mente all'utente. `richiestaISO` è già un
 * giorno, non un istante: si legge come mezzanotte UTC di quel giorno, e
 * `Date.UTC` normalizza da solo il cambio di mese o di anno quando si somma
 * un numero di giorni che sfora il mese.
 */
export function stimaArrivo(richiestaISO: string, platformKey: string): string {
  const [anno, mese, giorno] = richiestaISO.split("-").map(Number);
  const giorniAttesa = GIORNI_ATTESA[platformKey] ?? GIORNI_ATTESA_DEFAULT;
  const arrivo = new Date(Date.UTC(anno, mese - 1, giorno + giorniAttesa));
  return arrivo.toISOString().slice(0, 10);
}
