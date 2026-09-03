import "server-only";

import Papa from "papaparse";
import { searchMulti } from "@/lib/tmdb/client";

// ============ parsing ============

export interface NetflixRow {
  title: string;
  date: string; // ISO yyyy-mm-dd (best effort)
}

interface SeriesGroup {
  show: string;
  bySeasons: Map<number, number>; // season → episodi distinti nel CSV
  lastDate: string | null;
}

interface MovieGroup {
  title: string;
  lastDate: string | null;
}

export interface ImportCandidate {
  key: string;
  netflixTitle: string;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  rowCount: number;
}

export interface ImportProposal extends ImportCandidate {
  tmdbId: number | null;
  matchedTitle: string | null;
  posterPath: string | null;
  year: string | null;
}

const SEASON_RE =
  /^(.*?):\s*(?:(?:stagione|season|parte|part|capitolo|chapter|volume|libro|book)\s*(\d+)|(miniserie|limited series|serie limitata)):\s*(.+)$/i;

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

export function groupRows(rows: NetflixRow[]): ImportCandidate[] {
  const series = new Map<string, SeriesGroup>();
  const movies = new Map<string, MovieGroup>();

  for (const row of rows) {
    const m = row.title.match(SEASON_RE);
    if (m) {
      const show = m[1].trim();
      const season = m[2] ? parseInt(m[2], 10) : 1; // miniserie → stagione 1
      const key = normalizeTitle(show);
      const group = series.get(key) ?? {
        show,
        bySeasons: new Map<number, number>(),
        lastDate: null,
      };
      group.bySeasons.set(season, (group.bySeasons.get(season) ?? 0) + 1);
      if (row.date && (!group.lastDate || row.date > group.lastDate)) {
        group.lastDate = row.date;
      }
      series.set(key, group);
    } else {
      const key = normalizeTitle(row.title);
      const existing = movies.get(key);
      if (!existing) {
        movies.set(key, { title: row.title, lastDate: row.date || null });
      } else if (row.date && (!existing.lastDate || row.date > existing.lastDate)) {
        existing.lastDate = row.date;
      }
    }
  }

  const candidates: ImportCandidate[] = [];
  for (const [key, group] of series) {
    const maxSeason = Math.max(...group.bySeasons.keys());
    // posizione = numero di episodi di quella stagione presenti nel CSV
    const episode = group.bySeasons.get(maxSeason) ?? 1;
    candidates.push({
      key,
      netflixTitle: group.show,
      kind: "tv",
      season: maxSeason,
      episode,
      lastDate: group.lastDate,
      rowCount: [...group.bySeasons.values()].reduce((a, b) => a + b, 0),
    });
  }
  for (const [key, movie] of movies) {
    candidates.push({
      key,
      netflixTitle: movie.title,
      kind: "movie",
      season: null,
      episode: null,
      lastDate: movie.lastDate,
      rowCount: 1,
    });
  }
  return candidates;
}

// ============ matching ============

const ARTICLES =
  /^(the|a|an|il|lo|la|i|gli|le|un|uno|una|l|el|los|las|die|der|das|le|les)\s+/;

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ARTICLES, "");
}

const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 400;

export async function matchCandidates(
  candidates: ImportCandidate[],
): Promise<ImportProposal[]> {
  const proposals: ImportProposal[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        try {
          const search = await searchMulti(candidate.netflixTitle);
          const target = normalizeTitle(candidate.netflixTitle);
          const media = search.results.filter(
            (r): r is Extract<typeof r, { media_type: "movie" | "tv" }> =>
              r.media_type === (candidate.kind === "tv" ? "tv" : "movie"),
          );
          const hit = media.find((r) => {
            const name = r.media_type === "movie" ? r.title : r.name;
            const original =
              r.media_type === "movie" ? r.original_title : r.original_name;
            return (
              normalizeTitle(name) === target ||
              (original && normalizeTitle(original) === target)
            );
          });
          if (!hit) {
            return { ...candidate, tmdbId: null, matchedTitle: null, posterPath: null, year: null };
          }
          const name = hit.media_type === "movie" ? hit.title : hit.name;
          const date =
            hit.media_type === "movie" ? hit.release_date : hit.first_air_date;
          return {
            ...candidate,
            tmdbId: hit.id,
            matchedTitle: name,
            posterPath: hit.poster_path ?? null,
            year: date ? date.slice(0, 4) : null,
          };
        } catch {
          return { ...candidate, tmdbId: null, matchedTitle: null, posterPath: null, year: null };
        }
      }),
    );
    proposals.push(...results);
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  return proposals;
}
