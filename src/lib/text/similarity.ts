/**
 * Confronto fra titoli: forma canonica e somiglianza. Usato dall'import Netflix
 * (riconoscere un titolo del CSV su TMDB) e dai trailer (accertare che un video
 * YouTube sia di quel titolo). Funzioni pure, nessun `server-only`.
 */

// ============ normalizzazione ============

const ARTICLES =
  /^(the|a|an|il|lo|la|i|gli|le|un|uno|una|l|el|los|las|die|der|das|les)\s+/;

/** Code generiche che Netflix o TMDB aggiungono e che non distinguono un titolo. */
const GENERIC_SUFFIX =
  /\s+(il film|the movie|the film|la serie|the series|serie tv|netflix)$/;

/**
 * Forma canonica per il confronto: minuscole, senza accenti, parentesi, apostrofi
 * e punteggiatura; senza articolo iniziale né coda generica ("- Il film").
 * Non svuota mai la stringa: "Il film" → "film", "The" → "the".
 */
export function normalizeTitle(s: string): string {
  let out = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const noSuffix = out.replace(GENERIC_SUFFIX, "");
  if (noSuffix) out = noSuffix;
  const noArticle = out.replace(ARTICLES, "");
  if (noArticle) out = noArticle;
  return out;
}

// ============ somiglianza ============

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    map.set(b, (map.get(b) ?? 0) + 1);
  }
  return map;
}

/** Coefficiente di Sørensen–Dice sui bigrammi di caratteri (0..1). */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let common = 0;
  for (const [g, n] of ba) common += Math.min(n, bb.get(g) ?? 0);
  return (2 * common) / (a.length - 1 + (b.length - 1));
}

/** Separatore fra titolo e sottotitolo: " - ", " – ", ": ". */
export const SUBTITLE_SEPARATOR_RE = /\s+[-–—]\s+|:\s+/;

/** Sopra questa soglia un risultato TMDB viene accettato senza conferma manuale. */
export const MATCH_THRESHOLD = 0.85;

/**
 * Somiglianza fra il titolo Netflix e un nome TMDB (0..1).
 * 1 se uguali dopo normalizzazione; 0,9 se il nome TMDB è il titolo Netflix più
 * un sottotitolo ("Jumanji" → "Jumanji - Benvenuti nella giungla"); 0,88 se il
 * sottotitolo Netflix (≥ 2 parole) è l'intero nome TMDB; altrimenti Dice sui
 * bigrammi. Netflix più lungo per un "Parte II" resta a Dice: "Ritorno al
 * futuro - Parte II" non deve accettare "Ritorno al futuro".
 */
export function titleSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (a === b) return 1;
  // solo un vero sottotitolo (dopo " - " o ": "), non una parola in più:
  // "Dark" non è "Dark Matter"
  const rightMain = right.split(SUBTITLE_SEPARATOR_RE)[0] ?? "";
  const prefix = rightMain !== right && normalizeTitle(rightMain) === a ? 0.9 : 0;
  // Netflix antepone la saga e TMDB no: "Pirati dei Caraibi - La maledizione
  // della prima luna" → "La maledizione della prima luna". Serve un sottotitolo
  // di almeno due parole: "Dark: Segreti" non deve prendere un film "Segreti".
  const [, ...rest] = left.split(SUBTITLE_SEPARATOR_RE);
  const leftSub = rest.join(": ");
  const subtitle =
    leftSub.trim().split(/\s+/).length >= 2 && normalizeTitle(leftSub) === b ? 0.88 : 0;
  return Math.max(prefix, subtitle, dice(a, b));
}
