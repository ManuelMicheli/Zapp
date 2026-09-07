/** Le posizioni di una Top 10: un debutto al primo posto vale +10. */
const CHART_SIZE = 10;

/**
 * Quante posizioni ha guadagnato un titolo rispetto al periodo precedente.
 * Un debutto vale come se venisse da fuori classifica, ma non conta mai come discesa:
 * entrare al quindicesimo posto di una classifica lunga è comunque una notizia neutra.
 */
export function computeMomentum(previousRank: number | null, rank: number): number {
  if (previousRank === null) return Math.max(0, CHART_SIZE + 1 - rank);
  return previousRank - rank;
}
