import type { RatingSource, SourceValues } from "./types";

/**
 * Nomi con cui MDBList chiama le fonti, tradotti nei nostri. Il pubblico di Rotten
 * Tomatoes si chiama `popcorn` (il "popcornmeter"); gli alias storici restano perché
 * costano nulla e coprono un eventuale rinomina. Restano fuori di proposito
 * `metacriticuser` e `myanimelist`, per non contare il pubblico due volte, e
 * `rogerebert`, che non porta né `score` né `votes` (verificato su 100 titoli).
 */
const ALIASES: Record<string, RatingSource> = {
  imdb: "imdb",
  tmdb: "tmdb",
  trakt: "trakt",
  letterboxd: "letterboxd",
  popcorn: "audience",
  tomatoesaudience: "audience",
  audience: "audience",
  tomatoes: "tomatoes",
  metacritic: "metacritic",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Risposta MDBList → i nostri voti. Difensivo per scelta: lo schema OpenAPI dichiara gli
 * elementi di `ratings` come oggetti senza proprietà, e la verifica dal vivo ha mostrato
 * campi che cambiano forma. Si legge solo `score`, che è normalizzato 0-100 su ogni fonte
 * e su entrambi gli endpoint. Una forma inattesa dà `{}`, mai un'eccezione.
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

    const score = num(item.score);
    if (score === null || score < 0 || score > 100) continue;

    const votes = Math.max(0, Math.trunc(num(item.votes) ?? 0));
    const seen = out[source];
    if (seen && seen.votes >= votes) continue;
    out[source] = { score, votes };
  }
  return out;
}
