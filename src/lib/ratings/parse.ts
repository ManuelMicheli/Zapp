import type { RatingSource, SourceValues } from "./types";

/**
 * Nomi con cui MDBList chiama le fonti, tradotti nei nostri. Quello che non è qui
 * viene ignorato di proposito: `metacriticuser` (0-10 del pubblico Metacritic) e
 * `myanimelist` non entrano nella fase B per non raddoppiare il bacino del pubblico.
 */
const ALIASES: Record<string, RatingSource> = {
  imdb: "imdb",
  tmdb: "tmdb",
  trakt: "trakt",
  letterboxd: "letterboxd",
  tomatoes: "tomatoes",
  tomatoesaudience: "audience",
  audience: "audience",
  metacritic: "metacritic",
  rogerebert: "rogerebert",
};

/** Valore massimo della scala nativa: serve a scartare i valori impossibili. */
const MAX_VALUE: Record<RatingSource, number> = {
  imdb: 10,
  tmdb: 10,
  trakt: 10,
  letterboxd: 5,
  audience: 100,
  tomatoes: 100,
  metacritic: 100,
  rogerebert: 4,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Risposta MDBList → i nostri voti. Difensivo per scelta: lo schema OpenAPI dichiara
 * gli elementi di `ratings` come oggetti senza proprietà, quindi qualunque campo può
 * mancare o cambiare forma. Una forma inattesa dà `{}`, mai un'eccezione: la riga
 * verrà semplicemente ricalcolata al giro dopo.
 */
export function parseMdblistRatings(raw: unknown): SourceValues {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.ratings)
      ? raw.ratings
      : [];

  const out: SourceValues = {};
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = typeof item.source === "string" ? item.source.toLowerCase() : null;
    const source = name ? ALIASES[name] : undefined;
    if (!source) continue;

    const max = MAX_VALUE[source];
    // `score` di MDBList è normalizzato 0-100: se manca `value`, lo riportiamo in scala
    const direct = num(item.value);
    const fromScore = num(item.score);
    const value =
      direct ??
      (fromScore === null ? null : Math.round((fromScore / 100) * max * 10) / 10);
    if (value === null || value < 0 || value > max) continue;

    const votes = Math.max(0, Math.trunc(num(item.votes) ?? 0));
    const seen = out[source];
    if (seen && seen.votes >= votes) continue;
    out[source] = { value, votes };
  }
  return out;
}
