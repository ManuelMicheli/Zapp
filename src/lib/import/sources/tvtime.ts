/**
 * CSV a colonne riconosciute per nome: il tracciato dell'export TV Time
 * (`public/info/tvtime_export_example.csv`) e, senza codice in più, quelli di
 * Trakt e Simkl, che cambiano i nomi ma non le informazioni.
 *
 * Le righe con `tmdb_id` saltano del tutto il riconoscimento su TMDB: un export
 * da migliaia di righe diventa istantaneo nella prima fase.
 *
 * La scala dei voti si deduce dal file intero, non riga per riga: un voto sopra
 * 5 basta a dire che l'export e' gia' su 1-10 (Trakt, Simkl); altrimenti e' 1-5
 * (TV Time) e si raddoppia. Deciderlo per riga scambierebbe un vero "3" su 10
 * per un "3" su 5 raddoppiato a 6.
 */

import Papa from "papaparse";
import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import type { ParsedSource, SourceFile } from "./types";

const COLONNE_ATTESE =
  "Colonne attese: type, title, year, season, episode, watched_date, rating, tmdb_id.";

/** "Watched Date" → "watcheddate": nomi confrontabili fra export diversi. */
function normKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Primo valore presente fra gli alias, già ripulito. */
function pick(row: Record<string, string>, alias: string[]): string {
  for (const a of alias) {
    const v = row[a];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const ALIAS = {
  type: ["type", "mediatype", "entitytype", "kind"],
  title: ["title", "showname", "show", "name", "seriestitle", "movietitle"],
  year: ["year", "releaseyear", "firstaired"],
  season: ["season", "seasonnumber", "seasonnum"],
  episode: ["episode", "episodenumber", "episodenum"],
  date: ["watcheddate", "date", "watchedat", "lastwatched", "seendate"],
  rating: ["rating", "score", "vote", "userrating"],
  tmdb: ["tmdbid", "tmdb", "themoviedbid"],
} as const;

function isoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? match[0] : null;
}

/**
 * Deduce la scala dei voti dal file intero: un solo valore sopra 5 basta a dire
 * che l'export è già su 1-10; senza prove, 1-5 (TV Time). Come `inferDateOrder`
 * in `netflix.ts`, ma qui una sola prova già decide: sopra 5 non è ambiguo.
 */
function inferRatingScale(values: string[]): 5 | 10 {
  for (const value of values) {
    const n = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(n) && n > 5) return 10;
  }
  return 5;
}

/** Sulla scala 1-5 → 2-10; sulla scala 1-10 resta com'è. */
function toRating(value: string, scala: 5 | 10): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = scala === 5 ? n * 2 : n;
  return Math.max(1, Math.min(10, Math.round(scaled)));
}

function isShow(type: string, season: string, episode: string): boolean {
  const t = type.toLowerCase();
  if (t) return /show|serie|tv|episode/.test(t);
  // senza colonna `type`: una riga con stagione o episodio è una serie
  return season !== "" || episode !== "";
}

interface Group {
  title: string;
  kind: "movie" | "tv";
  tmdbId: number | null;
  year: string | null;
  season: number | null;
  episode: number | null;
  rating: number | null;
  lastDate: string | null;
  rowCount: number;
}

export function parseColumnCsv(text: string): ParsedSource {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normKey,
  });
  const groups = new Map<string, Group>();
  let rows = 0;
  const scala = inferRatingScale(parsed.data.map((row) => pick(row, [...ALIAS.rating])));

  for (const row of parsed.data) {
    const rawTitle = pick(row, [...ALIAS.title]);
    const tmdbRaw = pick(row, [...ALIAS.tmdb]);
    const tmdbId = /^\d+$/.test(tmdbRaw) ? Number.parseInt(tmdbRaw, 10) : null;
    if (!rawTitle && tmdbId == null) continue;
    rows++;
    // titolo assente ma id TMDB presente: etichetta segnaposto, il resolver salta il match
    const title = rawTitle || `TMDB ${tmdbId}`;

    const seasonRaw = pick(row, [...ALIAS.season]);
    const episodeRaw = pick(row, [...ALIAS.episode]);
    const kind = isShow(pick(row, [...ALIAS.type]), seasonRaw, episodeRaw)
      ? "tv"
      : "movie";
    const year = pick(row, [...ALIAS.year]) || null;
    const season = /^\d+$/.test(seasonRaw) ? Number.parseInt(seasonRaw, 10) : null;
    const episode = /^\d+$/.test(episodeRaw) ? Number.parseInt(episodeRaw, 10) : null;
    const date = isoDate(pick(row, [...ALIAS.date]));
    const rating = toRating(pick(row, [...ALIAS.rating]), scala);

    const key =
      tmdbId != null
        ? `${kind}:${tmdbId}`
        : `${kind}:${normalizeTitle(title)}|${year ?? ""}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        title,
        kind,
        tmdbId,
        year,
        season: kind === "tv" ? (season ?? 1) : null,
        episode: kind === "tv" ? (episode ?? 1) : null,
        rating,
        lastDate: date,
        rowCount: 1,
      });
      continue;
    }
    group.rowCount++;
    if (date && (!group.lastDate || date > group.lastDate)) group.lastDate = date;
    if (rating != null) group.rating = Math.max(group.rating ?? 0, rating);
    if (group.kind === "tv") {
      const s = season ?? 1;
      const e = episode ?? 1;
      const avanti =
        s > (group.season ?? 0) ||
        (s === (group.season ?? 0) && e > (group.episode ?? 0));
      if (avanti) {
        group.season = s;
        group.episode = e;
      }
    }
    if (group.tmdbId == null && tmdbId != null) group.tmdbId = tmdbId;
  }

  if (groups.size === 0) {
    return {
      candidates: [],
      rows: 0,
      error: `Nessuna riga leggibile. ${COLONNE_ATTESE}`,
    };
  }

  const candidates: ImportCandidate[] = [];
  for (const [key, g] of groups) {
    candidates.push({
      key,
      netflixTitle: g.title,
      kind: g.kind,
      season: g.season,
      episode: g.episode,
      lastDate: g.lastDate,
      rowCount: g.rowCount,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId: g.tmdbId,
      rating: g.rating,
      status: "watched",
      year: g.year,
    });
  }
  candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  return { candidates, rows };
}

export function parse(files: SourceFile[]): ParsedSource {
  const csv = files.filter((f) => !f.name.toLowerCase().endsWith(".json"));
  if (csv.length === 0) {
    return { candidates: [], rows: 0, error: `Nessun csv da leggere. ${COLONNE_ATTESE}` };
  }
  // più file (uno zip): si concatenano i candidati, la fusione la fa `mergeProposals`
  const candidates: ImportCandidate[] = [];
  let rows = 0;
  let error: string | undefined;
  for (const file of csv) {
    const out = parseColumnCsv(file.text);
    candidates.push(...out.candidates);
    rows += out.rows;
    error ??= out.error;
  }
  return candidates.length > 0 ? { candidates, rows } : { candidates: [], rows, error };
}
