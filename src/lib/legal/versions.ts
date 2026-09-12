/**
 * Le versioni correnti dei testi a cui l'utente acconsente.
 *
 * Alzarne una **rimette in coda quel consenso per tutti**: il gate del layout
 * `(app)` torna a chiederlo e la vecchia accettazione resta nello storico. È
 * l'unico modo di rispondere alla domanda che conta davvero — "a cosa aveva
 * acconsentito questa persona il giorno X" — che un booleano non sa reggere
 * (art. 7(1) GDPR: il titolare deve essere in grado di *dimostrare* il consenso).
 *
 * Per `terms` e `privacy` la versione è la data di pubblicazione del testo; per i
 * due facoltativi è un contatore, perché non hanno un documento proprio.
 */
export const VERSIONI = {
  terms: "2026-09-12",
  privacy: "2026-09-12",
  personalization: "1",
  scrobble: "1",
} as const;

/**
 * Età minima per usare Zapp da soli.
 *
 * 14 e non 16: l'Italia ha esercitato la deroga dell'art. 8(1) GDPR con
 * l'art. 2-quinquies del Codice Privacy. Vive qui e non in
 * `src/app/onboarding/actions.ts` perché quel file è `"use server"`, dove si
 * possono esportare solo funzioni asincrone: una costante lì dentro fa fallire
 * il build ("Only async functions are allowed to be exported").
 */
export const ETA_MINIMA = 14;

export type TipoConsenso = keyof typeof VERSIONI;

export interface RigaConsenso {
  kind: TipoConsenso;
  version: string;
  granted_at: string;
  revoked_at: string | null;
}

/**
 * Senza questi due l'app non si usa: sono il contratto e l'informativa.
 * `personalization` e `scrobble` sono facoltativi — mancanti, la funzione resta
 * spenta e basta, non si blocca niente.
 */
export const CONSENSI_OBBLIGATORI: TipoConsenso[] = ["terms", "privacy"];

/** true se esiste una riga attiva (non revocata) alla versione corrente. */
export function haConsenso(righe: RigaConsenso[], tipo: TipoConsenso): boolean {
  return righe.some(
    (r) => r.kind === tipo && r.version === VERSIONI[tipo] && r.revoked_at === null,
  );
}

/** Gli obbligatori che mancano, nell'ordine in cui vanno mostrati. */
export function consensiMancanti(righe: RigaConsenso[]): TipoConsenso[] {
  return CONSENSI_OBBLIGATORI.filter((tipo) => !haConsenso(righe, tipo));
}
