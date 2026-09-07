/**
 * Parsing del CSV Netflix e raggruppamento delle righe in candidati (una serie
 * con il suo progresso, un film). Funzioni pure, senza `server-only`: Vitest.
 */

import Papa from "papaparse";
import { normalizeTitle, parseNetflixTitle } from "./netflix-title";

// ============ parsing ============

export interface NetflixRow {
  title: string;
  date: string; // ISO yyyy-mm-dd (best effort), "" se assente
}

/** Ordine di giorno e mese nelle date del CSV: "dm" = 5/12 è il 5 dicembre, "md" = il 12 maggio. */
export type DateOrder = "dm" | "md";

/** "5/12/23", "05/12/2023", "2023-12-05" → [primo, secondo, anno]; null se non è una data. */
function splitDate(value: string): [number, number, number] | null {
  const parts = value.trim().split(/[/\-.]/);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  let [a, b] = nums;
  const c = nums[2];
  let year: number;
  if (c > 31) year = c;
  else if (a > 31) {
    year = a;
    [a, b] = [b, c];
  } else year = c < 100 ? 2000 + c : c;
  return [a, b, year];
}

/**
 * Deduce l'ordine giorno/mese dal file intero: una riga con il primo numero > 12
 * prova "dm", una con il secondo > 12 prova "md"; vince chi ha più prove. Senza
 * prove: "md", il formato dell'export Netflix (viewing activity, stile US) anche
 * per gli account italiani. Un file da 1500 righe con date invertite finisce
 * in ordine sbagliato in "Continua a guardare".
 */
export function inferDateOrder(values: string[]): DateOrder {
  let dm = 0;
  let md = 0;
  for (const value of values) {
    const parts = splitDate(value);
    if (!parts) continue;
    const [a, b] = parts;
    if (a > 12 && b <= 12) dm++;
    else if (b > 12 && a <= 12) md++;
  }
  return dm > md ? "dm" : "md";
}

/** Data del CSV → ISO yyyy-mm-dd secondo `order`; null se non valida. */
export function parseDate(value: string, order: DateOrder): string | null {
  const parts = splitDate(value);
  if (!parts) return null;
  const [a, b, year] = parts;
  let day: number, month: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else if (order === "dm") {
    day = a;
    month = b;
  } else {
    month = a;
    day = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseNetflixCsvText(text: string): NetflixRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const order = inferDateOrder(parsed.data.map((row) => row.Date ?? row.date ?? ""));
  const rows: NetflixRow[] = [];
  for (const row of parsed.data) {
    const title = row.Title ?? row.title;
    const date = row.Date ?? row.date;
    if (!title) continue;
    rows.push({ title: title.trim(), date: date ? (parseDate(date, order) ?? "") : "" });
  }
  return rows;
}

// ============ raggruppamento ============

export interface ImportCandidate {
  key: string;
  /** Nome della serie o titolo del film come scritto da Netflix */
  netflixTitle: string;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  rowCount: number;
  /**
   * Serie con stagione dal nome proprio ("Stranger Things: Stranger Things 4"):
   * da provare su TMDB prima di `netflixTitle`.
   */
  altTitle: string | null;
  /** Film "A: B": A, da provare come serie se B non è un film. */
  fallbackShow: string | null;
  /**
   * Nomi degli episodi visti nella stagione più avanzata (più quelli delle righe
   * "Serie: Episodio" senza stagione della stessa serie). Servono al matcher per
   * ricavare il numero d'episodio dall'elenco TMDB invece che contando le righe:
   * un export parziale ne ha poche e il conteggio farebbe tornare indietro il
   * progresso. Vuoto per i film.
   */
  episodeTitles: string[];
}

/** Quanti nomi di episodio portarsi dietro per candidato (payload client↔server). */
const EPISODE_TITLES_CAP = 60;

interface SeasonGroup {
  label: string;
  number: number | null;
  /** `show: label` quando la stagione ha un nome proprio */
  altShow: string | null;
  episodes: Set<string>;
  /** Nomi come li scrive Netflix, senza doppioni, nell'ordine di lettura. */
  titles: string[];
  maxEpisodeNumber: number | null;
  firstDate: string | null;
}

interface SeriesGroup {
  show: string;
  seasons: Map<string, SeasonGroup>;
  lastDate: string | null;
  rowCount: number;
  /** Episodi da righe "Serie: Episodio" senza stagione, di stagione ignota. */
  extraEpisodes: string[];
}

interface SingleGroup {
  title: string;
  prefix: string | null;
  /** Con "A: B": B, il possibile nome di episodio. */
  episode: string | null;
  lastDate: string | null;
  rowCount: number;
}

function laterDate(a: string | null, b: string): string | null {
  if (!b) return a;
  return !a || b > a ? b : a;
}

function earlierDate(a: string | null, b: string): string | null {
  if (!b) return a;
  return !a || b < a ? b : a;
}

/**
 * Numeri di stagione effettivi: le stagioni con numero lo tengono, quelle senza
 * ("Stagione finale", "Il grande torneo") vengono dopo, in ordine di prima visione.
 */
function numberSeasons(seasons: SeasonGroup[]): Map<SeasonGroup, number> {
  const out = new Map<SeasonGroup, number>();
  let max = 0;
  for (const s of seasons) {
    if (s.number != null) {
      out.set(s, s.number);
      max = Math.max(max, s.number);
    }
  }
  const unnumbered = seasons
    .filter((s) => s.number == null)
    .sort((a, b) => (a.firstDate ?? "9999").localeCompare(b.firstDate ?? "9999"));
  for (const s of unnumbered) out.set(s, ++max);
  return out;
}

export function groupRows(rows: NetflixRow[]): ImportCandidate[] {
  const series = new Map<string, SeriesGroup>();
  const singles = new Map<string, SingleGroup>();

  for (const row of rows) {
    const parsed = parseNetflixTitle(row.title);
    if (parsed.kind === "episode") {
      const key = normalizeTitle(parsed.show);
      let group = series.get(key);
      if (!group) {
        group = {
          show: parsed.show,
          seasons: new Map(),
          lastDate: null,
          rowCount: 0,
          extraEpisodes: [],
        };
        series.set(key, group);
      }
      const seasonKey = normalizeTitle(parsed.seasonLabel);
      let season = group.seasons.get(seasonKey);
      if (!season) {
        season = {
          label: parsed.seasonLabel,
          number: parsed.seasonNumber,
          altShow: parsed.altShow,
          episodes: new Set(),
          titles: [],
          maxEpisodeNumber: null,
          firstDate: null,
        };
        group.seasons.set(seasonKey, season);
      }
      const episodeKey = normalizeTitle(parsed.episode);
      if (!season.episodes.has(episodeKey)) {
        season.episodes.add(episodeKey);
        season.titles.push(parsed.episode);
      }
      if (parsed.episodeNumber != null) {
        season.maxEpisodeNumber = Math.max(
          season.maxEpisodeNumber ?? 0,
          parsed.episodeNumber,
        );
      }
      season.firstDate = earlierDate(season.firstDate, row.date);
      group.lastDate = laterDate(group.lastDate, row.date);
      group.rowCount++;
    } else {
      const key = normalizeTitle(parsed.title);
      const existing = singles.get(key);
      if (!existing) {
        singles.set(key, {
          title: parsed.title,
          prefix: parsed.prefix,
          episode: parsed.episode,
          lastDate: row.date || null,
          rowCount: 1,
        });
      } else {
        existing.lastDate = laterDate(existing.lastDate, row.date);
        existing.rowCount++;
      }
    }
  }

  // "Serie: Episodio" (due parti) di una serie che il CSV ha già raggruppato: è
  // un episodio, non un film. Cercarlo su TMDB fra i film è la fonte principale
  // di riconoscimenti sbagliati; il nome finisce fra gli episodi della serie.
  for (const [key, single] of [...singles]) {
    if (!single.prefix) continue;
    const group = series.get(normalizeTitle(single.prefix));
    if (!group) continue;
    if (single.episode) group.extraEpisodes.push(single.episode);
    group.rowCount += single.rowCount;
    if (single.lastDate) group.lastDate = laterDate(group.lastDate, single.lastDate);
    singles.delete(key);
  }

  const candidates: ImportCandidate[] = [];
  for (const [key, group] of series) {
    const numbered = numberSeasons([...group.seasons.values()]);
    let last: SeasonGroup | null = null;
    let lastNumber = 0;
    for (const [season, n] of numbered) {
      if (!last || n > lastNumber) {
        last = season;
        lastNumber = n;
      }
    }
    if (!last) continue;
    candidates.push({
      key: `tv:${key}`,
      netflixTitle: group.show,
      kind: "tv",
      season: lastNumber,
      episode: Math.max(last.maxEpisodeNumber ?? 0, last.episodes.size),
      lastDate: group.lastDate,
      rowCount: group.rowCount,
      altTitle: last.altShow,
      fallbackShow: null,
      episodeTitles: [...last.titles, ...group.extraEpisodes].slice(
        0,
        EPISODE_TITLES_CAP,
      ),
    });
  }
  for (const [key, single] of singles) {
    candidates.push({
      key: `movie:${key}`,
      netflixTitle: single.title,
      kind: "movie",
      season: null,
      episode: null,
      lastDate: single.lastDate,
      rowCount: single.rowCount,
      altTitle: null,
      fallbackShow: single.prefix,
      episodeTitles: [],
    });
  }
  // più recenti prima, senza data in fondo (l'ordine è stabile)
  return candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
}
