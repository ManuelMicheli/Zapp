/**
 * Come l'affinità personale entra nei simili. Funzione pura, provata con Vitest.
 *
 * La regola: **il filone comanda, il gusto ordina**. Lo scaffale si chiama "Perché hai
 * visto X", non "cose che ti piacciono": se l'affinità potesse ribaltare la classifica,
 * il titolo di partenza diventerebbe un pretesto. L'affinità moltiplica dentro una
 * banda stretta — da 0,6 a 1,4 — e questo basta a spostare l'ordine fra titoli che il
 * filone mette quasi alla pari, senza mai portare in cima un fuori tema.
 *
 * L'affinità è quella della fase C (`src/lib/rank/affinity.ts`), calcolata sul profilo
 * della fase A: qui non si deduce nessun gusto: sarebbe la seconda definizione della
 * stessa cosa.
 */

import type { SimilarItem } from "./types";

/** Punteggio dell'affinità sotto cui non si scende, e ampiezza della banda. */
export const BASE_AFFINITA = 0.75;
export const AMPIEZZA_AFFINITA = 0.5;

/**
 * Il punteggio finale di un titolo. `punteggio` è l'affinità 0-1 della fase C;
 * `null` (profilo assente, dimensioni sconosciute) lascia il punteggio com'era.
 */
export function blendAffinity(score: number, punteggio: number | null): number {
  if (punteggio == null || !Number.isFinite(punteggio)) return score;
  const clamped = Math.min(1, Math.max(0, punteggio));
  return score * (BASE_AFFINITA + AMPIEZZA_AFFINITA * clamped);
}

/**
 * La classifica impersonale diventa personale: fuori ciò che l'utente ha già in
 * libreria (un consiglio su un titolo già visto non è un consiglio), e l'ordine
 * ripesato sull'affinità. A pari punteggio decide l'id, così due render danno la
 * stessa cosa.
 */
export function applyAffinity(
  items: readonly SimilarItem[],
  affinita: ReadonlyMap<string, number>,
  owned: ReadonlySet<string> = new Set(),
): SimilarItem[] {
  return items
    .filter((item) => !owned.has(`${item.mediaType}-${item.id}`))
    .map((item) => {
      const punteggio = affinita.get(`${item.mediaType}-${item.id}`) ?? null;
      const score = blendAffinity(item.score, punteggio);
      return { ...item, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || a.id - b.id);
}
