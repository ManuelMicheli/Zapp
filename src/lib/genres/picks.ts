import dati from "@/data/genre-picks.json";

/**
 * I titoli scelti a mano per ogni voce del catalogo dei generi, con la loro fama
 * misurata (i voti su TMDB).
 *
 * Perché una testa curata e non solo una `discover`: `with_genres=27&sort_by=popularity`
 * dà l'horror *uscito questa settimana*, mai "L'Esorcista". Una pillola deve aprirsi su
 * ciò che uno si aspetta di trovarci dentro — poi, sotto, arriva la coda generata e
 * ordinata sul gusto.
 *
 * Il file lo genera `scripts/build-genre-picks.ts` interrogando TMDB una volta sola: a
 * runtime la testa di un genere non costa **nessuna** chiamata esterna.
 */

export interface GenrePick {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  backdropPath?: string | null;
  overview?: string | null;
  year: string | null;
  genreIds: number[];
  /** Voti su TMDB: quanto è visto, non quanto è di tendenza questa settimana. */
  voti: number;
  voto: number | null;
}

const PICKS = dati as Record<string, GenrePick[]>;

/** I titoli curati di una voce, dal più famoso al meno. Vuoto per una chiave ignota. */
export function genrePicks(key: string): GenrePick[] {
  return PICKS[key] ?? [];
}

/** Le chiavi che hanno una lista curata: serve al test del catalogo. */
export function genrePickKeys(): string[] {
  return Object.keys(PICKS);
}
