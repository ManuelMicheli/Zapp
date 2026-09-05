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

/** "5/12/23" o "12/5/23" o "05/12/2023" → ISO. Ambiguità risolta come D/M (IT). */
function parseDate(value: string): string | null {
  const parts = value.trim().split(/[/\-.]/);
  if (parts.length !== 3) return null;
  let [a, b, c] = parts.map((p) => parseInt(p, 10));
  if ([a, b, c].some((n) => Number.isNaN(n))) return null;
  let year: number, day: number, month: number;
  if (c > 31) year = c;
  else if (a > 31) {
    year = a;
    [a, b, c] = [b, c, a];
  } else year = c < 100 ? 2000 + c : c;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    // ambiguo: formato italiano D/M
    day = a;
    month = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseNetflixCsvText(text: string): NetflixRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: NetflixRow[] = [];
  for (const row of parsed.data) {
    const title = row.Title ?? row.title;
    const date = row.Date ?? row.date;
    if (!title) continue;
    rows.push({ title: title.trim(), date: date ? (parseDate(date) ?? "") : "" });
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
}

interface SeasonGroup {
  label: string;
  number: number | null;
  /** `show: label` quando la stagione ha un nome proprio */
  altShow: string | null;
  episodes: Set<string>;
  maxEpisodeNumber: number | null;
  firstDate: string | null;
}

interface SeriesGroup {
  show: string;
  seasons: Map<string, SeasonGroup>;
  lastDate: string | null;
  rowCount: number;
}

interface SingleGroup {
  title: string;
  prefix: string | null;
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
        group = { show: parsed.show, seasons: new Map(), lastDate: null, rowCount: 0 };
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
          maxEpisodeNumber: null,
          firstDate: null,
        };
        group.seasons.set(seasonKey, season);
      }
      season.episodes.add(normalizeTitle(parsed.episode));
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
          lastDate: row.date || null,
          rowCount: 1,
        });
      } else {
        existing.lastDate = laterDate(existing.lastDate, row.date);
        existing.rowCount++;
      }
    }
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
    });
  }
  // più recenti prima, senza data in fondo (l'ordine è stabile)
  return candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
}
