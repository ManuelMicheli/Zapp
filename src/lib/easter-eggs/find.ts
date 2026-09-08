import { CHICCHE, type Chicca, type ChiccaMediaType } from "./data";

type ChiccaSource = Chicca["source"];

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

/**
 * L'etichetta della fonte, sotto la recensione: il titolo e, per una serie,
 * dove è stato detto — "The Big Bang Theory · S7E4", "The Office · S4 · Money",
 * "Breaking Bad · S5". Per un film è solo il titolo.
 */
export function sourceLabel(source: ChiccaSource): string {
  const parts = [source.label];
  if (source.season != null) {
    parts.push(
      source.episode != null
        ? `S${source.season}E${source.episode}`
        : `S${source.season}`,
    );
  }
  if (source.episodeTitle) parts.push(source.episodeTitle);
  return parts.join(" · ");
}

/**
 * Dove porta l'etichetta: la scheda del film, oppure — se si sa la stagione — la
 * pagina di quella stagione, che è il posto più vicino all'episodio (le schede
 * per singolo episodio non esistono).
 */
export function sourceHref(source: ChiccaSource): string {
  const base = `/title/${source.mediaType}/${source.tmdbId}`;
  return source.mediaType === "tv" && source.season != null
    ? `${base}/season/${source.season}`
    : base;
}
