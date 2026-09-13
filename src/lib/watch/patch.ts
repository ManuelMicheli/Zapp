/**
 * Calcolo puro del patch da scrivere su `watch_entries` per le tre azioni
 * "rapide". Nessun import: la stessa funzione serve sia ad `actions.ts`
 * (Server Action con sessione) sia a `core.ts` (rotta a token dispositivo,
 * fase 4), e va testata senza rete ne' database.
 *
 * `now` arriva gia' come stringa ISO: chi chiama decide l'istante, cosi' i
 * test possono passare un valore fisso senza mockare `Date`.
 */

export type WatchAction = "want" | "watching" | "watched";

export type EntryLike = { started_at: string | null } | null;

export interface WatchPatch {
  status: WatchAction;
  started_at: string | null;
  finished_at: string | null;
  /**
   * Assente per "want": "Voglio vederlo" non e' una visione e non deve
   * spostare `watch_entries` in cima a "Continua a guardare"/libreria
   * (`last_watched_at` e' la colonna d'ordine, vedi watch-tracking.md).
   */
  last_watched_at?: string;
}

export function entryPatch(
  action: WatchAction,
  existing: EntryLike,
  now: string,
): WatchPatch {
  switch (action) {
    case "want":
      return {
        status: "want",
        started_at: existing?.started_at ?? null,
        finished_at: null,
      };
    case "watching":
      return {
        status: "watching",
        // "Inizia"/"Riprendi": se era gia' iniziata, non si torna a zero.
        started_at: existing?.started_at ?? now,
        finished_at: null,
        last_watched_at: now,
      };
    case "watched":
      return {
        status: "watched",
        started_at: existing?.started_at ?? null,
        finished_at: now,
        last_watched_at: now,
      };
  }
}
