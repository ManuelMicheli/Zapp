/**
 * Ordinamento puro delle card del carosello in testa alla home.
 * Nessun accesso a rete o DB: le sorgenti arrivano già lette (vedi `hero.ts`).
 */

export type HeroReason = "new" | "for_you" | "trending" | "popular";

export interface HeroItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  backdropPath: string | null;
  overview: string | null;
  year: string | null;
  genreIds: number[];
  voteAverage: number | null;
  reason: HeroReason;
}

export const HERO_REASON_LABEL: Record<HeroReason, string> = {
  new: "Novità",
  for_you: "Per te",
  trending: "Di tendenza",
  popular: "Molto visto",
};

/** Una sorgente: i suoi titoli, già nell'ordine in cui la sorgente li propone. */
export interface HeroSource {
  reason: HeroReason;
  items: Omit<HeroItem, "reason">[];
}

export const HERO_SIZE = 10;

/**
 * Alterna le sorgenti a rotazione (novità, per te, tendenza, popolari...), scarta i
 * doppioni e i titoli già in libreria (`exclude` = `"movie-123"`), ferma a `size`.
 * Una sorgente vuota non lascia buchi: le altre riempiono.
 */
export function buildHeroList(
  sources: HeroSource[],
  exclude: ReadonlySet<string>,
  size = HERO_SIZE,
): HeroItem[] {
  const out: HeroItem[] = [];
  const seen = new Set<string>();
  const cursors = sources.map(() => 0);

  let progressed = true;
  while (out.length < size && progressed) {
    progressed = false;
    for (let s = 0; s < sources.length && out.length < size; s++) {
      const { reason, items } = sources[s];
      while (cursors[s] < items.length) {
        const item = items[cursors[s]++];
        const key = `${item.mediaType}-${item.id}`;
        if (seen.has(key) || exclude.has(key)) continue;
        seen.add(key);
        out.push({ ...item, reason });
        progressed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * La lista mista della scheda "Tutto": film e serie a turno, uno per uno, dalle due
 * liste già ordinate. Una lista finita non lascia buchi — l'altra riempie fino a
 * `size`. L'ordine di ciascun tipo resta quello deciso da `buildHeroList`.
 */
export function mixHero(movie: HeroItem[], tv: HeroItem[], size = HERO_SIZE): HeroItem[] {
  const out: HeroItem[] = [];
  for (let i = 0; out.length < size && (i < movie.length || i < tv.length); i++) {
    if (movie[i]) out.push(movie[i]);
    if (out.length < size && tv[i]) out.push(tv[i]);
  }
  return out;
}

/**
 * I generi più visti: id → quante volte compaiono, in ordine decrescente.
 * `genres` è la colonna `titles.genres` (`[{id, name}]` di TMDB), tollerante a forme
 * diverse (righe vecchie senza `id`).
 */
export function topGenreIds(genreLists: unknown[], limit = 2): number[] {
  const count = new Map<number, number>();
  for (const genres of genreLists) {
    if (!Array.isArray(genres)) continue;
    for (const g of genres) {
      const id = g && typeof g === "object" ? (g as { id?: unknown }).id : null;
      if (typeof id !== "number") continue;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * TMDB usa id diversi per alcuni generi di film e serie (Azione 28 ↔ Action &
 * Adventure 10759, Fantascienza 878 / Fantasy 14 ↔ Sci-Fi & Fantasy 10765, Guerra
 * 10752 ↔ War & Politics 10768): i gusti dedotti dai film valgono anche per le serie
 * e viceversa. Gli altri generi (Dramma 18, Commedia 35...) coincidono.
 */
const MOVIE_TO_TV: Record<number, number> = {
  28: 10759,
  12: 10759,
  878: 10765,
  14: 10765,
  10752: 10768,
};
const TV_TO_MOVIE: Record<number, number> = { 10759: 28, 10765: 878, 10768: 10752 };

export function genreIdsFor(type: "movie" | "tv", ids: number[]): number[] {
  const map = type === "tv" ? MOVIE_TO_TV : TV_TO_MOVIE;
  return [...new Set(ids.map((id) => map[id] ?? id))];
}
