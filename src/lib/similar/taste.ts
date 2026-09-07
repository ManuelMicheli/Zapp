/**
 * Il pezzo personale dei consigli, e l'unico: la classifica salvata in
 * `title_similar` è impersonale e uguale per tutti, e qui viene ri-ordinata in
 * memoria per chi sta guardando. Funzione pura, provata con Vitest.
 *
 * L'idea: se una persona torna sullo stesso regista o sullo stesso tema in più
 * titoli che ha finito, quello non è un caso — è il suo gusto, e i consigli devono
 * pendere da quella parte. Con un solo titolo in libreria non si deduce niente e la
 * lista resta com'è: meglio un ordine onesto che una personalizzazione inventata.
 */

import type { SeedProfile, SimilarItem } from "./types";

/** Quante volte un segnale deve ripetersi per contare come gusto. */
const MIN_OCCURRENCES = 2;
const W_DIRECTOR = 0.6;
const W_KEYWORD = 0.4;
/** Un seme che l'utente ha amato tira più degli altri. */
const LOVED_RATING = 8;
const LOVED_BOOST = 1.1;

export interface TasteProfile {
  /** Registi che ricorrono fra i titoli finiti. */
  directorIds: Set<number>;
  /** Keyword che ricorrono fra i titoli finiti. */
  keywordIds: Set<number>;
}

/**
 * Il gusto dedotto dagli identikit dei titoli che la persona ha finito di recente.
 * Il voto non entra qui: le sorgenti bocciate sono già state scartate a monte
 * (`pickBecauseSources`), e il voto del singolo seme pesa in `applyTaste`.
 */
export function tasteProfile(seeds: readonly SeedProfile[]): TasteProfile {
  const directors = new Map<number, number>();
  const keywords = new Map<number, number>();
  for (const seed of seeds) {
    for (const person of seed.directors) {
      directors.set(person.id, (directors.get(person.id) ?? 0) + 1);
    }
    // Una keyword conta una volta per titolo, non una per volta che compare.
    for (const id of new Set(seed.keywords.map((k) => k.id))) {
      keywords.set(id, (keywords.get(id) ?? 0) + 1);
    }
  }
  const keep = (counts: Map<number, number>) =>
    new Set([...counts].filter(([, n]) => n >= MIN_OCCURRENCES).map(([id]) => id));
  return { directorIds: keep(directors), keywordIds: keep(keywords) };
}

/**
 * Ri-ordina la classifica impersonale con il gusto di chi guarda e toglie ciò che ha
 * già in libreria: un consiglio su un titolo già visto non è un consiglio.
 *
 * `seedRating` è il voto del titolo da cui parte lo scaffale ("Perché hai visto X"):
 * se l'utente lo ha amato, tutto quel filone conta di più.
 */
export function applyTaste(
  items: readonly SimilarItem[],
  taste: TasteProfile,
  owned: ReadonlySet<string> = new Set(),
  seedRating: number | null = null,
): SimilarItem[] {
  const loved = seedRating != null && seedRating >= LOVED_RATING;
  return items
    .filter((item) => !owned.has(`${item.mediaType}-${item.id}`))
    .map((item) => {
      let score = item.score;
      if (item.directorId != null && taste.directorIds.has(item.directorId)) {
        score += W_DIRECTOR;
      }
      const shared = item.keywordIds.filter((id) => taste.keywordIds.has(id)).length;
      score += W_KEYWORD * shared;
      if (loved) score *= LOVED_BOOST;
      return { ...item, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || a.id - b.id);
}
