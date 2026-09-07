/**
 * Funzioni pure per il riconoscimento dei titoli Netflix (nessun `server-only`:
 * coperte da Vitest). Il CSV di Netflix ha una riga per episodio, nel formato
 * `Serie: Stagione N: Titolo episodio`, ma con molte varianti: stagioni con
 * nome proprio ("Stranger Things: Stranger Things 4: Capitolo uno: …"), "Parte",
 * "Volume", "Libro", "Miniserie", episodi senza stagione ("Our Planet: …").
 */

import {
  MATCH_THRESHOLD,
  normalizeTitle,
  SUBTITLE_SEPARATOR_RE,
  titleSimilarity,
} from "@/lib/text/similarity";

export { MATCH_THRESHOLD, normalizeTitle, titleSimilarity } from "@/lib/text/similarity";

/**
 * Numero dell'episodio più avanzato fra quelli visti, riconoscendo i **nomi**
 * degli episodi del CSV nell'elenco TMDB della stagione. Netflix scrive il nome
 * dell'episodio, non il numero ("Dark: Stagione 1: Segreti"), quindi contare le
 * righe sbaglia sempre su un export parziale (3 righe nuove della stagione 4 =
 * "episodio 3") e su un riepilogo con episodi rivisti. null se nessun nome
 * corrisponde: in quel caso resta la stima per conteggio.
 */
export function resolveEpisodeNumber(
  csvEpisodeNames: string[],
  tmdbEpisodes: { episode_number: number; name?: string | null }[],
): number | null {
  if (csvEpisodeNames.length === 0 || tmdbEpisodes.length === 0) return null;
  const byName = new Map<string, number>();
  for (const ep of tmdbEpisodes) {
    if (!ep.name) continue;
    const key = normalizeTitle(ep.name);
    if (!key) continue;
    // a parità di nome (rari doppioni) vince l'episodio più avanti
    byName.set(key, Math.max(byName.get(key) ?? 0, ep.episode_number));
  }
  let best: number | null = null;
  for (const raw of csvEpisodeNames) {
    const key = normalizeTitle(raw);
    if (!key) continue;
    let n = byName.get(key) ?? null;
    if (n == null) {
      // nomi lunghi tagliati o con punteggiatura diversa: somiglianza alta
      for (const ep of tmdbEpisodes) {
        if (!ep.name) continue;
        if (titleSimilarity(raw, ep.name) >= 0.95) {
          n = Math.max(n ?? 0, ep.episode_number);
        }
      }
    }
    if (n != null && (best == null || n > best)) best = n;
  }
  return best;
}

export interface BestMatch<T> {
  item: T;
  score: number;
  /** true solo per uguaglianza dopo normalizzazione */
  exact: boolean;
}

/**
 * Sceglie fra i risultati TMDB quello più simile al titolo Netflix, confrontando
 * tutti i nomi disponibili (titolo IT e originale). A parità di punteggio vince
 * l'ordine di TMDB (rilevanza/popolarità). null sotto `MATCH_THRESHOLD`.
 */
export function pickBestMatch<T extends { names: (string | null | undefined)[] }>(
  netflixTitle: string,
  items: T[],
  threshold = MATCH_THRESHOLD,
): BestMatch<T> | null {
  let best: BestMatch<T> | null = null;
  for (const item of items) {
    let score = 0;
    for (const name of item.names) {
      if (!name) continue;
      score = Math.max(score, titleSimilarity(netflixTitle, name));
      if (score === 1) break;
    }
    if (score >= threshold && (!best || score > best.score)) {
      best = { item, score, exact: score === 1 };
    }
  }
  return best;
}

/**
 * Query da provare in ordine su TMDB: il titolo intero, poi senza parentesi,
 * poi la sola parte principale (prima di " - " o ": "), infine il solo
 * sottotitolo se ha almeno due parole. Il confronto avviene
 * sempre con il titolo intero: la query corta serve solo a far uscire il
 * risultato quando la ricerca TMDB inciampa su sottotitoli e punteggiatura.
 */
export function queryVariants(title: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  push(title);
  const noParens = title.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  push(noParens);
  const [main = "", ...rest] = noParens.split(SUBTITLE_SEPARATOR_RE);
  push(main);
  // Netflix antepone la saga e TMDB no ("Pirati dei Caraibi - La maledizione
  // della prima luna"): il sottotitolo da solo, se ha almeno due parole
  const sub = rest.join(": ");
  if (sub.trim().split(/\s+/).length >= 2) push(sub);
  return out;
}

// ============ struttura del titolo Netflix ============

const NUMBER_WORDS: Record<string, number> = {
  uno: 1,
  una: 1,
  one: 1,
  prima: 1,
  primo: 1,
  first: 1,
  due: 2,
  two: 2,
  seconda: 2,
  secondo: 2,
  second: 2,
  tre: 3,
  three: 3,
  terza: 3,
  terzo: 3,
  third: 3,
  quattro: 4,
  four: 4,
  quarta: 4,
  fourth: 4,
  cinque: 5,
  five: 5,
  quinta: 5,
  fifth: 5,
  sei: 6,
  six: 6,
  sesta: 6,
  sixth: 6,
  sette: 7,
  seven: 7,
  settima: 7,
  seventh: 7,
  otto: 8,
  eight: 8,
  ottava: 8,
  eighth: 8,
  nove: 9,
  nine: 9,
  nona: 9,
  ninth: 9,
  dieci: 10,
  ten: 10,
  decima: 10,
  tenth: 10,
};

const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

const MINISERIES_RE = /^(miniserie|mini-?series|limited series|serie limitata)$/i;

/** Parole con cui Netflix etichetta una stagione (seguite da un numero o un nome). */
const SEASON_KEYWORD_RE =
  /^(stagione|season|parte|part|volume|vol\.?|libro|book|serie|series|temporada|saison|staffel)\s+\S+$/i;

/**
 * Numero di stagione da un'etichetta: "Stagione 3", "Parte II", "Season Two",
 * "Stranger Things 4" (nome proprio con numero in coda), "Miniserie" → 1.
 * null se non c'è un numero ("Stagione finale", "Acqua").
 */
export function parseSeasonNumber(label: string): number | null {
  const s = label.trim().toLowerCase();
  if (MINISERIES_RE.test(s)) return 1;
  const digits = s.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const last = s.split(/\s+/).pop() ?? "";
  if (last in NUMBER_WORDS) return NUMBER_WORDS[last];
  if (s.includes(" ") && last in ROMAN) return ROMAN[last];
  return null;
}

/** Numero di episodio da "Episodio 3", "Capitolo uno", "Chapter IV", "Ep. 2". */
export function parseEpisodeNumber(label: string): number | null {
  const m = label
    .trim()
    .toLowerCase()
    .match(/^(?:episodio|episode|capitolo|chapter|ep\.?)\s+(\S+)/);
  if (!m) return null;
  const token = m[1].replace(/[^a-z0-9]/g, "");
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  if (token in ROMAN) return ROMAN[token];
  return null;
}

export interface ParsedEpisode {
  kind: "episode";
  /** Nome della serie (parti prima della stagione) */
  show: string;
  /**
   * Stagione con nome proprio: `show + ": " + stagione`, da provare per primo
   * su TMDB (se fallisce si ripiega su `show`). null con parola chiave esplicita.
   */
  altShow: string | null;
  seasonLabel: string;
  seasonNumber: number | null;
  episode: string;
  episodeNumber: number | null;
}

export interface ParsedSingle {
  kind: "single";
  title: string;
  /** Con "A: B": A, da provare come serie se B non è un film */
  prefix: string | null;
  episode: string | null;
}

export type ParsedNetflixTitle = ParsedEpisode | ParsedSingle;

function isSeasonPart(part: string): boolean {
  return SEASON_KEYWORD_RE.test(part.trim()) || MINISERIES_RE.test(part.trim());
}

/**
 * Struttura di una riga Netflix. Parola chiave di stagione in una parte
 * intermedia → episodio; nessuna parola chiave ma almeno tre parti → episodio
 * con stagione dal nome proprio (seconda parte); due parti → singolo con
 * prefisso; una parte → singolo.
 */
export function parseNetflixTitle(title: string): ParsedNetflixTitle {
  const parts = title
    .split(/:\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const n = parts.length;

  for (let i = 1; i <= n - 2; i++) {
    if (!isSeasonPart(parts[i])) continue;
    const episode = parts.slice(i + 1).join(": ");
    return {
      kind: "episode",
      show: parts.slice(0, i).join(": "),
      altShow: null,
      seasonLabel: parts[i],
      seasonNumber: parseSeasonNumber(parts[i]),
      episode,
      episodeNumber: parseEpisodeNumber(episode),
    };
  }

  if (n >= 3) {
    const episode = parts.slice(2).join(": ");
    return {
      kind: "episode",
      show: parts[0],
      altShow: `${parts[0]}: ${parts[1]}`,
      seasonLabel: parts[1],
      seasonNumber: parseSeasonNumber(parts[1]),
      episode,
      episodeNumber: parseEpisodeNumber(episode),
    };
  }

  if (n === 2) {
    return { kind: "single", title: title.trim(), prefix: parts[0], episode: parts[1] };
  }
  return { kind: "single", title: title.trim(), prefix: null, episode: null };
}
