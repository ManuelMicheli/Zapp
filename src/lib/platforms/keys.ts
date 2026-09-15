import { PLATFORMS } from "./catalog";

/**
 * Quello che arriva dal client non è mai una chiave valida finché non lo verifichi.
 *
 * Pura e senza `import "server-only"` apposta: sta in un file suo perché la usa anche
 * Vitest (che non gira in ambiente server), non solo `setUserPlatforms`.
 *
 * Un `Set` fa doppio lavoro: toglie i doppioni mantenendo l'ordine di prima apparizione
 * (i `Set` di JS lo garantiscono), e il risultato non può mai superare le chiavi del
 * catalogo perché è un sottoinsieme di quelle conosciute — nessun taglio esplicito
 * serve.
 */
export function chiaviValide(grezze: unknown): string[] {
  if (!Array.isArray(grezze)) return [];
  const conosciute = new Set(PLATFORMS.map((p) => p.key));
  const scelte = new Set<string>();
  for (const g of grezze) {
    if (typeof g === "string" && conosciute.has(g)) scelte.add(g);
  }
  return [...scelte];
}
