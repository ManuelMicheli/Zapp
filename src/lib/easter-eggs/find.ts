import { CHICCHE, type Chicca, type ChiccaMediaType } from "./data";

/**
 * La chicca di un titolo, se c'è. Funzione pura: l'elenco è statico, la ricerca
 * è un `find` sull'array (una ventina di voci, non serve una mappa).
 */
export function chiccaFor(mediaType: ChiccaMediaType, tmdbId: number): Chicca | null {
  return (
    CHICCHE.find((c) => c.target.mediaType === mediaType && c.target.tmdbId === tmdbId) ??
    null
  );
}

/** Chiave "movie:238" di un riferimento, per i controlli di coerenza. */
export function chiccaKey(ref: { mediaType: ChiccaMediaType; tmdbId: number }): string {
  return `${ref.mediaType}:${ref.tmdbId}`;
}

/**
 * Spezza la recensione attorno alla battuta vera: `[prima, battuta, dopo]`.
 * In pagina solo il pezzo di mezzo va in evidenza — è l'unico davvero detto nel
 * film o nella serie, il resto lo abbiamo scritto noi in voce del personaggio.
 * Se la battuta non compare nel testo (non dovrebbe: c'è un test) torna `null`
 * e il componente rende la recensione intera, senza evidenza.
 */
export function splitAroundQuote(
  review: string,
  quote: string,
): [string, string, string] | null {
  const at = review.indexOf(quote);
  if (at < 0) return null;
  return [review.slice(0, at), quote, review.slice(at + quote.length)];
}
