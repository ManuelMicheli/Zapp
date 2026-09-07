/**
 * La formula dei consigli. Funzione pura: prende l'identikit del seme, i candidati
 * raccolti da TMDB e i voti già letti, e restituisce la classifica con il motivo di
 * ogni titolo. Tutta la logica di prodotto sta qui, quindi si prova senza rete.
 *
 * L'idea in una riga: **filone × qualità × età**. Tre blocchi che si moltiplicano,
 * così nessuno può vincere da solo — un capolavoro fuori tema non entra, e un titolo
 * perfettamente in tema ma brutto non finisce primo.
 */

import { keywordLabel } from "./keyword-labels";
import type { Candidate, SeedProfile, SimilarItem } from "./types";

/** Quanti titoli tiene la classifica salvata: la UI ne mostra 12-20. */
export const SIMILAR_SIZE = 40;

// --- Pesi del filone -------------------------------------------------------

const W_KEYWORD = 2.2;
/** Una keyword arrivata dalla ricerca in AND vale doppio: è il nucleo del filone. */
const STRONG_FACTOR = 2;
const W_COLLECTION = 3;
const W_DIRECTOR = 1.6;
const W_WRITER = 0.8;
const W_CAST = 0.5;
const MAX_CAST_HITS = 2;
/** Il genere è l'ultimo dei segnali, non il primo: pesa meno di tutto il resto. */
const W_GENRE = 0.6;
const W_COLLAB = 0.4;
const COLLAB_DEPTH = 20;

/**
 * Sotto questo punteggio di filone un titolo non entra: è la soglia che tiene fuori
 * "anche lui è un thriller". Un candidato che condivide *tutti* i generi arriva a
 * 0,6 e passa; chi ne condivide uno su tre si ferma a 0,2 e resta fuori.
 */
const MIN_FILONE = 0.45;

/** Voti minimi perché un titolo sia una raccomandazione e non una scommessa. */
const MIN_VOTES = { movie: 50, tv: 20 } as const;

/** Massimo di titoli della stessa saga e dello stesso regista in una classifica. */
const MAX_PER_GROUP = 2;

/**
 * Quanti segnali distinti fanno di un legame un legame **solido**. Uno solo — una
 * keyword vaga come "fall from grace", che TMDB appiccica a mezzo catalogo — portava
 * in coda ai simili di Dune una commedia spagnola (visto il 2026-09-07). Saga, regia
 * e una keyword del nucleo (la ricerca in AND) valgono da sole: lì il legame è certo.
 *
 * Non è una porta chiusa: i solidi vengono **prima**, e solo se non bastano a
 * riempire lo scaffale si pesca fra gli altri. Amputare la lista lasciava quattro
 * titoli sotto Oppenheimer, e uno scaffale mezzo vuoto è un difetto quanto uno
 * scaffale a caso.
 */
const MIN_SIGNALS = 2;

// --- I tre blocchi ---------------------------------------------------------

/**
 * Quanto pesa una keyword condivisa, dedotto da quanti titoli la portano
 * (`total_results` della `discover`, che arriva gratis). "Loop temporale" ne accosta
 * poche centinaia e vale quasi 1; "amicizia" ne accosta decine di migliaia e vale un
 * quinto. Nessuna classifica compilata a mano.
 */
export function keywordIdf(totalResults: number): number {
  const total = Math.min(Math.max(totalResults, 20), 500_000);
  const idf = Math.log10(1_000_000 / total) / 4;
  return Math.min(Math.max(idf, 0.15), 1);
}

/**
 * Lo ZappScore (o il voto TMDB) non decide il filone, ma affonda la spazzatura e
 * rompe i pareggi: da 0,75 (voto pessimo) a 1,25 (voto ottimo). Senza voto resta 1,
 * così un titolo ancora senza dati non viene punito.
 */
export function qualityMultiplier(rating0to10: number | null): number {
  if (rating0to10 == null || !Number.isFinite(rating0to10)) return 1;
  const clamped = Math.min(Math.max(rating0to10 / 10, 0), 1);
  return 0.75 + 0.5 * clamped;
}

/**
 * La penalità d'età, morbida e asimmetrica. Se il seme è degli ultimi tre anni un
 * candidato più vecchio scende il doppio più in fretta: è il caso che dà fastidio
 * all'utente, un film del 2026 che consiglia roba degli anni Novanta. Pavimento a
 * 0,5, mai zero: il capostipite di un filone deve poter restare in classifica se il
 * filone combacia davvero.
 */
export function ageMultiplier(
  seedYear: number | null,
  candidateYear: number | null,
  now = new Date(),
): number {
  if (seedYear == null || candidateYear == null) return 1;
  const gap = Math.abs(candidateYear - seedYear);
  const seedIsRecent = seedYear >= now.getFullYear() - 3;
  const older = candidateYear < seedYear;
  const k = seedIsRecent && older ? 0.5 : 0.25;
  return Math.max(0.5, 1 - (k * Math.max(0, gap - 5)) / 40);
}

/**
 * Generi che non sono un gusto ma una **forma**: animazione, documentario, per
 * bambini, reality, talk, telegiornale. Un cartone e un film dal vero possono
 * condividere tutte le keyword del mondo e restare cose diverse — sotto Stranger
 * Things arrivavano tre anime perché condividevano "mondo parallelo"
 * (visto il 2026-09-07).
 */
const FORM_GENRES = [16, 99, 10762, 10764, 10767, 10763];

/** Forma diversa dal seme: il titolo resta, ma molto più indietro. */
export function formMultiplier(
  seedGenres: readonly number[],
  candidateGenres: readonly number[],
): number {
  for (const genre of FORM_GENRES) {
    if (seedGenres.includes(genre) !== candidateGenres.includes(genre)) return 0.55;
  }
  return 1;
}

function jaccard(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((id) => setB.has(id)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * Quanti legami distinti ci sono fra candidato e seme (una keyword, la saga, la
 * regia, un volto, i consigli di TMDB): non quanto pesano, quanti sono.
 */
export function signalCount(seed: SeedProfile, candidate: Candidate): number {
  let n = candidate.keywordHits.length;
  if (candidate.fromCollection) n++;
  if (candidate.director && seed.directors.some((d) => d.id === candidate.director!.id)) {
    n++;
  }
  n += Math.min(candidate.castHits.length, MAX_CAST_HITS);
  if (candidate.collabRank != null) n++;
  return n;
}

/** Un legame che da solo basta a garantire il filone. */
function hasCertainLink(seed: SeedProfile, candidate: Candidate): boolean {
  if (candidate.fromCollection) return true;
  if (candidate.director && seed.directors.some((d) => d.id === candidate.director!.id)) {
    return true;
  }
  return candidate.keywordHits.some((hit) => hit.strong);
}

/** La somma dei segnali che legano un candidato al seme. */
export function lineageScore(seed: SeedProfile, candidate: Candidate): number {
  let score = 0;
  for (const hit of candidate.keywordHits) {
    score += W_KEYWORD * hit.idf * (hit.strong ? STRONG_FACTOR : 1);
  }
  if (candidate.fromCollection) score += W_COLLECTION;
  if (candidate.director && seed.directors.some((d) => d.id === candidate.director!.id)) {
    score += W_DIRECTOR;
  }
  if (candidate.writer && seed.writers.some((w) => w.id === candidate.writer!.id)) {
    score += W_WRITER;
  }
  score += W_CAST * Math.min(candidate.castHits.length, MAX_CAST_HITS);
  score += W_GENRE * jaccard(seed.genreIds, candidate.genreIds);
  if (candidate.collabRank != null) {
    score += W_COLLAB * Math.max(0, 1 - candidate.collabRank / COLLAB_DEPTH);
  }
  return score;
}

/**
 * Perché questo titolo è qui, in italiano e in ordine di forza: la saga prima di
 * tutto, poi l'autore, poi il tema (che è il filone vero), infine il volto noto.
 * Una keyword che non sappiamo tradurre non diventa mai un motivo.
 */
export function reasonFor(seed: SeedProfile, candidate: Candidate): string | null {
  if (candidate.fromCollection) return "Stessa saga";
  const director = candidate.director;
  if (director && seed.directors.some((d) => d.id === director.id)) {
    return `Di ${director.name}`;
  }
  const labels = [...candidate.keywordHits]
    .sort((a, b) => b.idf - a.idf)
    .map((hit) => keywordLabel(hit.name))
    .filter((label): label is string => label != null);
  if (labels.length > 0) return labels.slice(0, 2).join(" · ");
  if (candidate.castHits.length > 0) return `Con ${candidate.castHits[0].name}`;
  return null;
}

// --- Classifica ------------------------------------------------------------

export interface RankOptions {
  /** Voto 0-10 per candidato, chiave `"movie-123"`. ZappScore, o il voto TMDB. */
  ratings?: ReadonlyMap<string, number | null>;
  size?: number;
  /** Iniettabile per i test: "oggi" decide chi non è ancora uscito. */
  now?: Date;
}

export function candidateKey(id: number, mediaType: "movie" | "tv"): string {
  return `${mediaType}-${id}`;
}

/**
 * Igiene: un consiglio dev'essere guardabile stasera, avere una locandina e un voto
 * che significhi qualcosa. E non dev'essere il titolo da cui siamo partiti.
 */
function usable(seed: SeedProfile, candidate: Candidate, today: string): boolean {
  if (candidate.id === seed.id && candidate.mediaType === seed.mediaType) return false;
  if (!candidate.posterPath) return false;
  if (candidate.adult) return false;
  if (candidate.voteCount < MIN_VOTES[candidate.mediaType]) return false;
  // Non ancora uscito: niente locandine di cose che nessuno può vedere.
  if (candidate.releaseDate && candidate.releaseDate > today) return false;
  return true;
}

/**
 * La classifica finale. L'ordine è deterministico (a pari punteggio decide l'id),
 * così due render danno la stessa cosa e la cache non "balla".
 */
export function rankCandidates(
  seed: SeedProfile,
  candidates: readonly Candidate[],
  options: RankOptions = {},
): SimilarItem[] {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const size = options.size ?? SIMILAR_SIZE;
  const ratings = options.ratings;

  const scored: {
    item: SimilarItem;
    directorId: number | null;
    saga: boolean;
    solid: boolean;
  }[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidateKey(candidate.id, candidate.mediaType);
    if (seen.has(key)) continue;
    if (!usable(seed, candidate, today)) continue;

    const lineage = lineageScore(seed, candidate);
    if (lineage < MIN_FILONE) continue;
    seen.add(key);
    const solid =
      signalCount(seed, candidate) >= MIN_SIGNALS || hasCertainLink(seed, candidate);

    const rating = ratings?.get(key) ?? candidate.voteAverage;
    const score =
      lineage *
      qualityMultiplier(rating ?? null) *
      ageMultiplier(seed.year, candidate.year, now) *
      formMultiplier(seed.genreIds, candidate.genreIds);

    scored.push({
      item: {
        id: candidate.id,
        mediaType: candidate.mediaType,
        title: candidate.title,
        posterPath: candidate.posterPath,
        year: candidate.year,
        score: Math.round(score * 1000) / 1000,
        reason: reasonFor(seed, candidate),
        directorId: candidate.director?.id ?? null,
        keywordIds: candidate.keywordHits.map((hit) => hit.id),
        genreIds: candidate.genreIds,
      },
      directorId: candidate.director?.id ?? null,
      saga: candidate.fromCollection,
      solid,
    });
  }

  // Prima i legami solidi, poi il riempimento: dentro ciascun gruppo, il punteggio.
  scored.sort(
    (a, b) =>
      Number(b.solid) - Number(a.solid) ||
      b.item.score - a.item.score ||
      a.item.id - b.item.id,
  );

  // Tetto per gruppo: altrimenti i simili di un film Marvel sono l'elenco dei film
  // Marvel, e quelli di un film di Nolan la filmografia di Nolan.
  const out: SimilarItem[] = [];
  let sagaCount = 0;
  const perDirector = new Map<number, number>();
  for (const row of scored) {
    if (out.length >= size) break;
    if (row.saga && sagaCount >= MAX_PER_GROUP) continue;
    if (row.directorId != null) {
      const count = perDirector.get(row.directorId) ?? 0;
      if (count >= MAX_PER_GROUP) continue;
      perDirector.set(row.directorId, count + 1);
    }
    if (row.saga) sagaCount++;
    out.push(row.item);
  }
  return out;
}
