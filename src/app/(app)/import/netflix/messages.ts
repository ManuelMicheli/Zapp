/**
 * Messaggi condivisi fra la server action di import e il client.
 * Vive fuori da `actions.ts` perché un modulo `"use server"` può esportare
 * solo funzioni asincrone.
 */
export const CSV_INVALID_MESSAGE =
  "CSV vuoto o formato non riconosciuto (attese colonne Title, Date).";
