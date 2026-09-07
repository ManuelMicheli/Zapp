import type {
  Confidence,
  RatingScale,
  RatingSource,
  ScoreBreakdownRow,
  SourceValues,
  ZappScore,
} from "./types";

interface Calibration {
  /** Voti sotto i quali il voto viene tirato verso la media della fonte. */
  m: number;
  /** Media globale della fonte, già in scala 0-10. */
  c: number;
  pool: "public" | "critic";
  /** Scala con cui la fonte si presenta al pubblico, per la sola visualizzazione. */
  display: RatingScale;
}

/**
 * Calibrazione delle fonti.
 *
 * I valori `c` sono STIME iniziali (2026-09-07), non misure: vanno ricalcolate con una
 * query su `title_ratings` appena la tabella supera le 5000 righe, e la data qui sopra va
 * aggiornata. Le soglie `m` dicono quanti voti servono perché una fonte "conti da sola":
 * più la fonte è piccola (i critici), più bassa è la soglia.
 *
 * `display` non entra nel calcolo: dice solo come si scrive il voto in pagina, perché ogni
 * sito si presenta con la propria scala (IMDb su 10, Letterboxd su 5, il resto in
 * percentuale). Il punteggio arriva sempre normalizzato 0-100 dal parser.
 */
export const SOURCE_CALIBRATION: Record<RatingSource, Calibration> = {
  imdb: { m: 2500, c: 6.7, pool: "public", display: "10" },
  tmdb: { m: 500, c: 6.6, pool: "public", display: "10" },
  trakt: { m: 500, c: 7.2, pool: "public", display: "100" },
  letterboxd: { m: 1000, c: 6.4, pool: "public", display: "5" },
  audience: { m: 1000, c: 6.6, pool: "public", display: "100" },
  tomatoes: { m: 20, c: 6.2, pool: "critic", display: "100" },
  metacritic: { m: 12, c: 6.1, pool: "critic", display: "100" },
};

/** Quanto pesa la critica quando è ben rappresentata. */
const CRITIC_WEIGHT = 0.3;
/** Massa critica (somma dei pesi) oltre la quale la critica pesa per intero. */
const CRITIC_FULL_MASS = 2.5;
const HIGH_VOTES = 10_000;
const MEDIUM_VOTES = 1_000;

const SOURCES = Object.keys(SOURCE_CALIBRATION) as RatingSource[];

/** Il voto come lo scrive la fonte: IMDb 8,4 · Letterboxd 4,4 · Metacritic 79. */
export function displayValue(score: number, scale: RatingScale): number {
  if (scale === "10") return Math.round(score) / 10;
  if (scale === "5") return Math.round(score / 2) / 10;
  return Math.round(score);
}

/**
 * Il voto aggregato di Zapp.
 *
 * Tre idee, in quest'ordine:
 * 1. ogni fonte viene tirata verso la propria media in proporzione a quanti voti ha
 *    (bayesiana), così un 10/10 con tre voti non vale niente;
 * 2. dentro ogni bacino le fonti pesano in **logaritmo** dei voti: pesare in modo
 *    lineare vorrebbe dire che esiste solo IMDb, pesare uguale vorrebbe dire che 67
 *    critici contano quanto un milione di persone;
 * 3. pubblico e critica sono due bacini distinti, mescolati 70/30 — ma il 30 della
 *    critica si riduce se i critici sono pochi, così un singolo recensore non muove
 *    il voto di un film.
 */
export function zappScore(values: SourceValues): ZappScore {
  const breakdown: ScoreBreakdownRow[] = [];
  let pubNum = 0;
  let pubDen = 0;
  let pubVotes = 0;
  let pubSources = 0;
  let criNum = 0;
  let criDen = 0;
  let criCount = 0;

  for (const source of SOURCES) {
    const raw = values[source];
    if (!raw) continue;
    const cal = SOURCE_CALIBRATION[source];
    breakdown.push({
      source,
      value: displayValue(raw.score, cal.display),
      votes: raw.votes,
      scale: cal.display,
    });
    // Senza voti la fonte si mostra ma non pesa: non sappiamo quanto valga
    if (raw.votes <= 0) continue;

    const r = raw.score / 10;
    const adjusted = (raw.votes * r + cal.m * cal.c) / (raw.votes + cal.m);
    const weight = Math.log10(1 + raw.votes);

    if (cal.pool === "public") {
      pubNum += adjusted * weight;
      pubDen += weight;
      pubVotes += raw.votes;
      pubSources += 1;
    } else {
      criNum += adjusted * weight;
      criDen += weight;
      criCount += raw.votes;
    }
  }

  const hasPublic = pubDen > 0;
  const hasCritic = criDen > 0;
  if (!hasPublic && !hasCritic) {
    return { score: null, votes: 0, critics: 0, confidence: "low", breakdown };
  }

  const publicScore = hasPublic ? pubNum / pubDen : 0;
  const criticScore = hasCritic ? criNum / criDen : 0;
  // Senza pubblico la critica prende tutto; con poca critica il suo 30% si assottiglia
  const criticWeight = !hasPublic
    ? 1
    : CRITIC_WEIGHT * Math.min(1, criDen / CRITIC_FULL_MASS);
  const blended = hasCritic
    ? (1 - criticWeight) * publicScore + criticWeight * criticScore
    : publicScore;

  const confidence: Confidence = !hasPublic
    ? "low"
    : pubVotes >= HIGH_VOTES && pubSources >= 2
      ? "high"
      : pubVotes >= MEDIUM_VOTES
        ? "medium"
        : "low";

  return {
    score: Math.round(blended * 10) / 10,
    votes: pubVotes,
    critics: criCount,
    confidence,
    breakdown,
  };
}
