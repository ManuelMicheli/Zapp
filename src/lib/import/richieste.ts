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

/**
 * Quanti giorni dopo il primo promemoria arriva il secondo (poi silenzio): il job
 * `promemoria-export`, in `src/lib/import/promemoria.ts`, lo usa insieme a
 * `prossimoPromemoria` qui sotto.
 */
export const GIORNI_SECONDO_SOLLECITO = 7;

/** I soli campi di una riga di `import_requests` che contano per `prossimoPromemoria`. */
export interface RichiestaPromemoria {
  state: "requested" | "imported" | "dismissed";
  /** Solo giorno, ISO `YYYY-MM-DD`: la stessa forma di `expected_at`. */
  expectedAt: string;
  /** ISO completo, o `null` se non ancora mandato. */
  remindedAt: string | null;
  /** ISO completo, o `null` se non ancora mandato. */
  secondRemindedAt: string | null;
}

export type EsitoPromemoria = "primo" | "secondo" | null;

/**
 * Quale promemoria mandare **oggi** per questa richiesta, o `null` se nessuno.
 *
 * Il primo quando la data attesa e' arrivata e non se n'e' ancora mandato nessuno;
 * il secondo quando ne sono passati altri `GIORNI_SECONDO_SOLLECITO` dal primo e lo
 * stato e' ancora `requested`. Dopo il secondo la funzione non ha un terzo caso:
 * silenzio per sempre, anche se la richiesta resta aperta all'infinito — due
 * promemoria sono un aiuto, un terzo sarebbe una molestia (vedi la spec di fase 3).
 *
 * `oggiISO` e `adesso` arrivano dal chiamante (non e' `new Date()` qui dentro)
 * perche' la funzione resti pura e testabile: stessa scelta di `stimaArrivo`.
 */
export function prossimoPromemoria(
  riga: RichiestaPromemoria,
  oggiISO: string,
  adesso: Date,
): EsitoPromemoria {
  if (riga.state !== "requested") return null;

  if (riga.remindedAt === null) {
    return riga.expectedAt <= oggiISO ? "primo" : null;
  }

  if (riga.secondRemindedAt !== null) return null;

  const soglia = new Date(riga.remindedAt);
  soglia.setUTCDate(soglia.getUTCDate() + GIORNI_SECONDO_SOLLECITO);
  return adesso >= soglia ? "secondo" : null;
}
