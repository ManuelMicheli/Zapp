/** Le otto fonti che sappiamo leggere. Tutto il resto che arriva viene ignorato. */
export type RatingSource =
  | "imdb"
  | "tmdb"
  | "trakt"
  | "letterboxd"
  | "audience"
  | "tomatoes"
  | "metacritic"
  | "rogerebert";

export interface SourceValue {
  /** Valore nella scala nativa della fonte (IMDb 0-10, Rotten Tomatoes 0-100...). */
  value: number;
  /** Quante persone o critici l'hanno votato; 0 se la fonte non lo dice. */
  votes: number;
}

export type SourceValues = Partial<Record<RatingSource, SourceValue>>;

export type Confidence = "low" | "medium" | "high";

/** Come si legge il valore di una fonte, per mostrarlo nella sua scala vera. */
export type RatingScale = "10" | "100" | "5" | "4";

export interface ScoreBreakdownRow {
  source: RatingSource;
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
