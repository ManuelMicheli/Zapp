/**
 * Contratto comune delle sorgenti di import: ogni parser riceve i file caricati
 * (già in testo) e restituisce candidati. Funzioni pure, coperte da Vitest.
 */
import type { ImportCandidate } from "../candidate";

export interface SourceFile {
  /** Nome originale: a Letterboxd serve per capire quale csv è. */
  name: string;
  text: string;
}

export interface ParsedSource {
  candidates: ImportCandidate[];
  /** Righe lette dai file, per il registro `imports.rows`. */
  rows: number;
  /** Messaggio pronto per l'utente quando non c'è niente da importare. */
  error?: string;
}
