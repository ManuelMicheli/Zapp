/**
 * La griglia del passo 2 dell'onboarding: "scegline almeno 3 che ti piacciono".
 *
 * Puro e testato: chi apre Zapp per la prima volta vede questa griglia e nient'altro,
 * quindi le regole (mai troppi titoli dello stesso genere, film e serie mescolati,
 * niente doppioni) devono essere verificabili senza database.
 */

export interface SeedCandidate {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  genreIds: number[];
  /** Posizione in una classifica corrente; `null` se arriva dal trending. */
  rank: number | null;
  /** ZappScore 0-10, la scala di `title_ratings.zapp_score`. */
  score: number | null;
}

export const SEED_GRID_SIZE = 30;
export const SEED_MIN_PICKS = 3;
export const SEED_MAX_PICKS = 5;
/** Oltre tre titoli dello stesso genere la griglia smette di dire qualcosa di nuovo. */
export const SEED_MAX_PER_GENRE = 3;

export function pickSeedGrid(
  candidates: SeedCandidate[],
  size = SEED_GRID_SIZE,
): SeedCandidate[] {
  const ordinati = candidates
    .filter((c) => c.posterPath)
    .sort((a, b) => {
      // Prima chi è in una classifica (lo riconoscono tutti), poi il voto.
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return (b.score ?? 0) - (a.score ?? 0);
    });

  const perTipo = { movie: [] as SeedCandidate[], tv: [] as SeedCandidate[] };
  const visti = new Set<string>();
  const perGenere = new Map<number, number>();

  for (const c of ordinati) {
    const chiave = `${c.mediaType}-${c.id}`;
    if (visti.has(chiave)) continue;
    // il tetto vale sul primo genere, quello principale
    const genere = c.genreIds[0];
    if (genere !== undefined) {
      const n = perGenere.get(genere) ?? 0;
      if (n >= SEED_MAX_PER_GENRE) continue;
      perGenere.set(genere, n + 1);
    }
    visti.add(chiave);
    perTipo[c.mediaType].push(c);
  }

  // Alternati: una griglia di soli film direbbe a metà degli utenti che Zapp non fa
  // per loro prima ancora di aver cominciato.
  const out: SeedCandidate[] = [];
  const massimo = Math.max(perTipo.movie.length, perTipo.tv.length);
  for (let i = 0; i < massimo && out.length < size; i++) {
    if (perTipo.movie[i]) out.push(perTipo.movie[i]);
    if (out.length < size && perTipo.tv[i]) out.push(perTipo.tv[i]);
  }
  return out;
}

/** `movie-603` → riga da scrivere. Scarta qualunque cosa storta. */
export function parseSeedKey(
  key: string,
): { titleId: number; mediaType: "movie" | "tv" } | null {
  const taglio = key.indexOf("-");
  if (taglio < 0) return null;
  const tipo = key.slice(0, taglio);
  const id = key.slice(taglio + 1);
  if (tipo !== "movie" && tipo !== "tv") return null;
  if (!/^\d+$/.test(id)) return null;
  return { titleId: Number(id), mediaType: tipo };
}
