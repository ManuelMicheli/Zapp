// Punteggio puro di un candidato TMDB (nessun `server-only`: e' l'unica parte
// di questo task coperta da Vitest, `matchTitle` in match.ts fa rete e DB e
// non si testa qui). Tenuta in un file a se' apposta perche' `match.ts` importa
// il client Supabase e quello TMDB, entrambi `server-only`, e un modulo con
// quell'import in cima non si puo' caricare da un test (lo stesso schema di
// `src/lib/cinema/booking/match.ts` rispetto a `fetch.ts`/`resolve.ts`).

import {
  normalizeTitle,
  SUBTITLE_SEPARATOR_RE,
  titleSimilarity,
} from "@/lib/text/similarity";
import type { ParsedMedia } from "./types";

/**
 * Un sottotitolo che indica un'**altra opera**: un seguito, una stagione, un
 * volume, o un numero nudo. Davanti a uno di questi il titolo piu' corto e' un
 * film diverso — "Ritorno al futuro - Parte II" non e' "Ritorno al futuro" — e
 * la regola qui sotto non si applica.
 */
const SEGUITO =
  /^(?:parte|part|stagione|season|serie|series|volume|vol\.?|libro|book|capitolo|chapter|atto|act)\b|^(?:[ivxlcdm]+|\d+)$/i;

/** Punteggio del titolo che combacia a meno del sottotitolo del distributore. */
const MAIN_PART_SCORE = 0.87;

/**
 * Somiglianza fra il titolo **letto dal player** e un nome TMDB.
 *
 * `titleSimilarity` esclude di proposito il caso "il titolo di partenza e' piu'
 * lungo del nome TMDB", perche' nell'import del CSV quella coda e' quasi sempre
 * un "Parte II" o una stagione, cioe' un'opera diversa. Su un player la coda e'
 * un'altra cosa: e' il sottotitolo con cui il distributore pubblica l'opera —
 * l'h4 di Netflix dava "Hajime no Ippo: The Fighting!" mentre TMDB ha solo
 * "Hajime no Ippo", somiglianza 0,667, e la serie non si riconosceva **mai**
 * (verificato contro TMDB il 2026-09-09: un solo risultato in tutto).
 *
 * Quindi qui, e solo qui, un titolo che combacia a meno del sottotitolo vale
 * `MAIN_PART_SCORE`: sopra la soglia, ma **sotto** l'uguaglianza esatta, cosi'
 * dove TMDB ha entrambi ("Squid Game" e "Squid Game: La sfida") vince sempre
 * quello giusto. I seguiti restano fuori.
 */
export function playerTitleSimilarity(playerTitle: string, name: string): number {
  const diretta = titleSimilarity(playerTitle, name);
  const [main = "", ...rest] = playerTitle.split(SUBTITLE_SEPARATOR_RE);
  const sottotitolo = rest.join(": ").trim();
  if (!sottotitolo || SEGUITO.test(sottotitolo)) return diretta;
  if (normalizeTitle(main) !== normalizeTitle(name)) return diretta;
  return Math.max(diretta, MAIN_PART_SCORE);
}

/** Sopra questa soglia il candidato si accetta senza chiedere niente all'utente. */
export const MATCH_THRESHOLD = 0.85;

/**
 * Sopra questo scarto in anni (con entrambi gli anni noti) un candidato viene
 * penalizzato: due omonimi ("Dark" 2017 e "Dark" un altro anno) altrimenti si
 * distinguerebbero solo dalla piattaforma. Uno scarto di 1 non basta: le date
 * di uscita italiane slittano spesso di un anno da quelle originali.
 */
const YEAR_MISMATCH_TOLERANCE = 1;
/**
 * Penalita' per anni troppo distanti: piu' delle due spinte (`hasProvider` +
 * popolarita', 0,1 al massimo) sommate insieme, cosi' un anno sbagliato non
 * puo' mai essere ribaltato da quelle.
 */
const YEAR_MISMATCH_PENALTY = 0.2;

/** Nome che si vuole valutato contro `ParsedMedia.title`, non `Candidate` di types.ts:
 * quella e' gia' un risultato (titolo TMDB scelto), questa e' solo l'ingrediente per
 * calcolare uno `score`. */
export type ScoreCandidate = {
  name: string;
  /**
   * Nome originale del candidato. Netflix scrive il titolo con cui distribuisce
   * l'opera in Italia, che a volte e' quello italiano di TMDB e a volte quello
   * originale (di solito quando in Italia non e' mai stato tradotto, ma non
   * solo). Confrontare un nome solo faceva fallire meta' dei casi senza che si
   * potesse capire quale meta': si tiene il migliore dei due, come fa gia'
   * `pickBestMatch` per l'import del CSV.
   */
  originalName?: string | null;
  year: number | null;
  /** il titolo e' offerto dalla piattaforma su cui stiamo guardando */
  hasProvider: boolean;
  popularity: number;
};

/**
 * Somiglianza del nome (il grosso), una penalita' quando gli anni sono noti e
 * troppo distanti, piu' due spinte piccole: essere offerto dalla piattaforma
 * giusta e la popolarita'. Le spinte non devono mai ribaltare la somiglianza:
 * sommate valgono al massimo 0,1. Non c'e' un `Math.min(…, 1)` finale apposta:
 * un titolo identico ha gia' `base` = 1, e ritagliare la somma a 1 avrebbe
 * cancellato le due spinte proprio nel caso piu' comune (due candidati con lo
 * stesso nome esatto, uno offerto dalla piattaforma e l'altro no — vedi il test
 * "premia chi e' offerto…"), che deve comunque distinguerli. Un punteggio
 * leggermente sopra 1 non e' un problema: conta solo l'ordine fra candidati e
 * il confronto con `MATCH_THRESHOLD`.
 *
 * `titleSimilarity` normalizza gia' da sola (accenti, punteggiatura, articolo)
 * e usa le stringhe originali per riconoscere un vero sottotitolo ("Jumanji" →
 * "Jumanji - Benvenuti nella giungla"): normalizzarle qui prima di passargliele
 * toglierebbe proprio i due punti e i trattini che le servono per quel confronto,
 * quindi si passano cosi' come arrivano, non gia' normalizzate.
 *
 * `parsed.year` oggi arriva sempre `null` dal browser (l'anno non si legge dal
 * DOM di Netflix/Prime/Disney), quindi la penalita' non scatta mai in pratica:
 * e' pronta per quando una fonte lo sapra' dire (companion Android, o un
 * giorno l'estensione stessa).
 */
export function scoreCandidate(parsed: ParsedMedia, c: ScoreCandidate): number {
  const base = Math.max(
    playerTitleSimilarity(parsed.title, c.name),
    c.originalName ? playerTitleSimilarity(parsed.title, c.originalName) : 0,
  );
  const provider = c.hasProvider ? 0.06 : 0;
  const pop = (Math.min(Math.max(c.popularity, 0), 100) / 100) * 0.04;
  const yearMismatch =
    parsed.year !== null &&
    c.year !== null &&
    Math.abs(parsed.year - c.year) > YEAR_MISMATCH_TOLERANCE;
  const yearPenalty = yearMismatch ? YEAR_MISMATCH_PENALTY : 0;
  return base + provider + pop - yearPenalty;
}
