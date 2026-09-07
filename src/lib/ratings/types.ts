/** Le sette fonti che sappiamo leggere. Tutto il resto che arriva viene ignorato. */
export type RatingSource =
  "imdb" | "tmdb" | "trakt" | "letterboxd" | "audience" | "tomatoes" | "metacritic";

export interface SourceValue {
  /**
   * Punteggio **normalizzato 0-100**, il campo `score` di MDBList. Non usiamo `value`:
   * cambia scala fra gli endpoint (Letterboxd vale 4,4/5 sul singolo titolo e 8,4/10 nel
   * lotto), mentre `score` è sempre 0-100 su ogni fonte e ogni endpoint.
   */
  score: number;
  /** Quante persone o critici l'hanno votato; 0 se la fonte non lo dice. */
  votes: number;
}

export type SourceValues = Partial<Record<RatingSource, SourceValue>>;

export type Confidence = "low" | "medium" | "high";

/** Come si mostra il voto di una fonte, nella scala con cui quella fonte si presenta. */
export type RatingScale = "10" | "100" | "5";

export interface ScoreBreakdownRow {
  source: RatingSource;
  /** Valore già convertito per la vista, nella scala con cui la fonte si presenta. */
  value: number;
  votes: number;
  scale: RatingScale;
}

export interface ZappScore {
  /** 0-10 con un decimale; `null` quando nessuna fonte è utilizzabile. */
  score: number | null;
  /** Somma dei voti del pubblico: è il "(2,4M voti)" mostrato accanto al punteggio. */
  votes: number;
  /** Numero di critici sommati. */
  critics: number;
  confidence: Confidence;
  breakdown: ScoreBreakdownRow[];
}
