/**
 * Tipi del motore dei consigli. Stanno a parte perché li usano sia le funzioni pure
 * (`signals`, `score`, `taste`, provate con Vitest) sia i moduli che parlano con TMDB
 * e col database: nessuno dei due deve importare l'altro solo per un'interfaccia.
 */

export type MediaType = "movie" | "tv";

export interface SeedKeyword {
  id: number;
  /** Nome TMDB, sempre in inglese e in minuscolo: non si mostra mai così com'è. */
  name: string;
}

export interface Person {
  id: number;
  name: string;
}

/**
 * L'identikit del titolo di partenza: cosa *è* quel titolo, non cosa TMDB gli
 * accosta. È da qui che nascono i candidati, ed è questo che viene salvato accanto
 * alla classifica per non doverlo ricavare due volte da `titles.raw`.
 */
export interface SeedProfile {
  id: number;
  mediaType: MediaType;
  year: number | null;
  keywords: SeedKeyword[];
  collectionId: number | null;
  /** Registi (film) o creatori (serie): l'autore del titolo. */
  directors: Person[];
  writers: Person[];
  cast: Person[];
  genreIds: number[];
}

/** Una keyword del seme che il candidato condivide, con la rarità già misurata. */
export interface KeywordHit {
  id: number;
  name: string;
  /** Peso della keyword: più è rara, più vale (vedi `keywordIdf`). */
  idf: number;
  /** Arrivato dalla ricerca con due keyword in AND: è il nucleo del filone. */
  strong: boolean;
}

/**
 * Un titolo candidato con l'elenco dei segnali che lo legano al seme. Da quale
 * interrogazione TMDB sia arrivato si sa per costruzione: nessuna chiamata in più
 * per sapere se condivide una keyword.
 */
export interface Candidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: number | null;
  voteAverage: number | null;
  voteCount: number;
  genreIds: number[];
  adult: boolean;
  releaseDate: string | null;
  keywordHits: KeywordHit[];
  /** Stessa saga del seme. */
  fromCollection: boolean;
  director: Person | null;
  writer: Person | null;
  castHits: Person[];
  /** Posizione fra i "consigliati" di TMDB, `null` se non c'era. */
  collabRank: number | null;
}

/**
 * Un titolo della classifica finale. È anche la forma salvata in `title_similar`,
 * quindi i campi in coda (`directorId`, `keywordIds`, `genreIds`) servono al
 * ri-ordino personale della home, che avviene in memoria e non tocca la cache
 * condivisa.
 */
export interface SimilarItem {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: number | null;
  score: number;
  /** Perché è qui, in italiano: "Stessa saga", "Di Denis Villeneuve", "Rapina". */
  reason: string | null;
  directorId: number | null;
  keywordIds: number[];
  genreIds: number[];
}
