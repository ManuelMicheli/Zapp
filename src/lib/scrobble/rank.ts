// Punteggio puro di un candidato TMDB (nessun `server-only`: e' l'unica parte
// di questo task coperta da Vitest, `matchTitle` in match.ts fa rete e DB e
// non si testa qui). Tenuta in un file a se' apposta perche' `match.ts` importa
// il client Supabase e quello TMDB, entrambi `server-only`, e un modulo con
// quell'import in cima non si puo' caricare da un test (lo stesso schema di
// `src/lib/cinema/booking/match.ts` rispetto a `fetch.ts`/`resolve.ts`).

import { titleSimilarity } from "@/lib/import/netflix-title";
import type { ParsedMedia } from "./types";

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
  const base = titleSimilarity(parsed.title, c.name);
  const provider = c.hasProvider ? 0.06 : 0;
  const pop = (Math.min(Math.max(c.popularity, 0), 100) / 100) * 0.04;
  const yearMismatch =
    parsed.year !== null &&
    c.year !== null &&
    Math.abs(parsed.year - c.year) > YEAR_MISMATCH_TOLERANCE;
  const yearPenalty = yearMismatch ? YEAR_MISMATCH_PENALTY : 0;
  return base + provider + pop - yearPenalty;
}
