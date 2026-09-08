/**
 * Come si scrivono i voti sotto una copertina. Puro: lo usano sia i componenti server
 * sia quelli client, e la scheda titolo.
 */

/**
 * Il numero di voti in forma compatta: sotto la copertina c'è spazio per una riga di
 * undici pixel, quindi "2,4M" e non "2.412.883". Sopra il milione una cifra decimale,
 * fra le diecimila e il milione le migliaia tonde ("24mila"), sotto il numero intero
 * (in italiano quattro cifre non si separano: 9999, non 9.999).
 */
export function formatVotes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}M`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 1000).toLocaleString("it-IT")}mila`;
  }
  return Math.round(n).toLocaleString("it-IT");
}

/** Il voto 0-10 come si scrive in pagina: un decimale, virgola italiana. */
export function formatScore(score: number): string {
  return score.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}
