/**
 * L'ordine dentro la fila di un mood: **prima i più visti**, con una spinta leggera da
 * quanto il titolo somiglia ai gusti di chi guarda.
 *
 * Chi tocca "Cuore infranto" ha fatto una richiesta esplicita: vuole i titoli giusti,
 * non i suoi soliti generi. Per questo la fama decide, e il gusto ritocca — a parità di
 * notorietà passa avanti ciò che gli somiglia, ma nessuna affinità porta un titolo da
 * duemila voti davanti a uno da quarantamila.
 */

/**
 * Quanto pesa il gusto. La fama entra in scala logaritmica e nelle liste curate va da
 * ~3 (mille voti) a ~4,6 (quarantamila): tutto lo spazio disponibile è 1,6. Una spinta
 * da 0,6 ne valeva più di un terzo e scavalcava titoli molto più visti — non era una
 * spinta, era un secondo ordinamento. A 0,15 sposta chi è distante meno di una volta e
 * mezza in voti, cioè riordina i vicini e lascia stare la classifica.
 */
export const SPINTA_GUSTO = 0.15;

/**
 * Il peso con cui si ordina un titolo curato.
 * `punteggio` è l'affinità 0..1 del motore di ranking; 0 quando il profilo non dice
 * ancora niente, e in quel caso l'ordine è la pura fama.
 */
export function pesoFama(voti: number, punteggio: number): number {
  const f = Math.log10(Math.max(voti, 1));
  const g = Math.min(1, Math.max(0, punteggio));
  return f + SPINTA_GUSTO * g;
}

/**
 * Ordina per peso decrescente. A parità esatta vince chi ha più voti, così l'ordine è
 * sempre lo stesso fra due render (nessuna lista che balla).
 */
export function ordinaPerFama<T extends { voti: number; punteggio: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const d = pesoFama(b.voti, b.punteggio) - pesoFama(a.voti, a.punteggio);
    return d !== 0 ? d : b.voti - a.voti;
  });
}
