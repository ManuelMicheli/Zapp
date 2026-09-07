/**
 * Code che indicano una stagione, non un titolo. Nella classifica Netflix arrivano in
 * inglese, ma le raccogliamo anche in italiano perché JustWatch e TMDB le scrivono così.
 */
const SEASON_TAIL =
  /:\s*(?:season|stagione|part|parte|series|serie|volume|vol\.?)\s*(?:\d+|one|two|three|i{1,3}v?|uno|due|tre)\s*$/i;
const LIMITED_TAIL = /:\s*(?:limited series|miniseries|miniserie|serie limitata)\s*$/i;
const SEASON_NUMBER = /:\s*(?:season|stagione|part|parte|volume|vol\.?)\s*(\d+)\s*$/i;

/**
 * Il nome da cercare su TMDB. La classifica premia la serie, non la stagione.
 *
 * La coda si toglie **solo quando `seasonTitle` c'è**, cioè su una riga `TV`. È il
 * discrimine che tiene insieme i due casi che altrimenti si contraddicono: "Outer
 * Banks: Season 5" va tagliato, "Kill Bill: Volume 1" no — e l'unica differenza fra i
 * due è che il primo è una serie. Sulle righe `Films` il file Netflix lascia
 * `season_title` a `N/A`, che il parser ha già tradotto in `null`.
 */
export function cleanChartTitle(showTitle: string, seasonTitle: string | null): string {
  const base = showTitle.trim();
  if (!seasonTitle) return base;
  const cut = base.replace(LIMITED_TAIL, "").replace(SEASON_TAIL, "").trim();
  return cut || base;
}

/** Numero di stagione scritto nel titolo di stagione, se c'è. */
export function chartSeasonNumber(seasonTitle: string | null): number | null {
  if (!seasonTitle) return null;
  const m = SEASON_NUMBER.exec(seasonTitle);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
