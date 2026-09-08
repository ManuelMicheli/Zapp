import dati from "@/data/mood-picks.json";

/**
 * I titoli scelti a mano per ogni mood, con la loro fama misurata (i voti su TMDB).
 *
 * Perché una lista curata e non una `discover`: i generi non sanno distinguere un
 * dramma commovente da un dramma di guerra. "Triste" con `with_genres=18` dava un
 * dramma qualsiasi molto votato, mai *quello* che uno cerca quando è triste. Qui ogni
 * titolo è in lista perché è quello stato d'animo.
 *
 * Il file lo genera `scripts/build-mood-picks.ts` interrogando TMDB una volta sola:
 * a runtime la testa di una fila di mood non costa **nessuna** chiamata esterna.
 */

export interface MoodPick {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  /** Fondale e trama: la fila del momento è un banner, non uno scaffale. */
  backdropPath?: string | null;
  overview?: string | null;
  year: string | null;
  genreIds: number[];
  /** Voti su TMDB: quanto è visto, non quanto è di tendenza questa settimana. */
  voti: number;
  voto: number | null;
}

const PICKS = dati as Record<string, MoodPick[]>;

/** I titoli curati di un mood, dal più famoso al meno. Vuoto per i momenti. */
export function picksFor(key: string): MoodPick[] {
  return PICKS[key] ?? [];
}
