/**
 * Un file qualunque, riconosciuto dal contenuto e non dall'estensione:
 * 1. backup Zapp (l'export dell'account) → si rilegge per `title_id`, zero TMDB
 * 2. elenco JSON di titoli → come il csv generico, ma in JSON
 * 3. csv a colonne riconosciute → lo stesso parser di TV Time
 * Quando non è nessuno dei tre, l'errore dice cosa cercavamo.
 */

import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import { parseColumnCsv } from "./tvtime";
import type { ParsedSource, SourceFile } from "./types";

const NON_RICONOSCIUTO =
  "Il file non sembra un backup Zapp né un elenco di titoli. " +
  "Attesi un JSON con watch_entries, oppure voci con un campo title.";

function isoDate(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  return match ? match[0] : null;
}

function intOf(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Voto di un backup Zapp: è già sulla scala di `watch_entries` (1-10), quindi
 * non si riscala — ma si butta quello fuori scala. `rating: 0` ("non votato",
 * come lo scrivono parecchi export) faceva alzare il check `between 1 and 10`
 * alla RPC, e una riga sola faceva fallire la scrittura di tutto il blocco.
 */
function backupRating(value: unknown): number | null {
  const n = intOf(value);
  return n != null && n >= 1 && n <= 10 ? n : null;
}

/** 1-5 → 2-10; già su 10 resta su 10. */
function ratingOf(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(10, Math.round(n <= 5 ? n * 2 : n)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Backup Zapp: le righe hanno `title_id` e `media_type`. */
function fromBackup(entries: unknown[]): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const raw of entries) {
    if (!isRecord(raw)) continue;
    const tmdbId = intOf(raw.title_id);
    const kind = raw.media_type === "tv" ? "tv" : "movie";
    if (tmdbId == null) continue;
    candidates.push({
      key: `${kind}:${tmdbId}`,
      netflixTitle: String(raw.title ?? raw.name ?? `TMDB ${tmdbId}`),
      kind,
      season: kind === "tv" ? (intOf(raw.season_number) ?? 1) : null,
      episode: kind === "tv" ? (intOf(raw.episode_number) ?? 1) : null,
      lastDate: isoDate(raw.last_watched_at ?? raw.finished_at),
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId,
      rating: backupRating(raw.rating),
      // "watching"/"dropped" tornano dentro come visti: il progresso decide lo stato
      status: raw.status === "want" ? "want" : "watched",
      year: null,
    });
  }
  return candidates;
}

/** Elenco generico: oggetti con un campo titolo. */
function fromList(items: unknown[]): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const title = String(raw.title ?? raw.name ?? raw.titolo ?? "").trim();
    if (!title) continue;
    const season = intOf(raw.season ?? raw.season_number);
    const episode = intOf(raw.episode ?? raw.episode_number);
    const declared = String(raw.type ?? raw.media_type ?? raw.kind ?? "").toLowerCase();
    const kind =
      declared !== ""
        ? /show|serie|tv|episode/.test(declared)
          ? "tv"
          : "movie"
        : season != null || episode != null
          ? "tv"
          : "movie";
    const year = raw.year != null ? String(raw.year) : null;
    candidates.push({
      key: `${kind}:${normalizeTitle(title)}|${year ?? ""}`,
      netflixTitle: title,
      kind,
      season: kind === "tv" ? (season ?? 1) : null,
      episode: kind === "tv" ? (episode ?? 1) : null,
      lastDate: isoDate(raw.date ?? raw.watched_date ?? raw.last_watched_at),
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      tmdbId: intOf(raw.tmdb_id ?? raw.tmdbId),
      rating: ratingOf(raw.rating),
      status: raw.status === "want" ? "want" : "watched",
      year,
    });
  }
  return candidates;
}

function parseOne(file: SourceFile): ParsedSource {
  const text = file.text.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { candidates: [], rows: 0, error: "JSON non valido." };
    }
    if (isRecord(data) && Array.isArray(data.watch_entries)) {
      const candidates = fromBackup(data.watch_entries);
      return candidates.length > 0
        ? { candidates, rows: data.watch_entries.length }
        : { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
    }
    const list = Array.isArray(data)
      ? data
      : isRecord(data)
        ? ((data.items ?? data.entries ?? data.titles ?? data.titoli) as unknown)
        : null;
    if (Array.isArray(list)) {
      const candidates = fromList(list);
      return candidates.length > 0
        ? { candidates, rows: list.length }
        : { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
    }
    return { candidates: [], rows: 0, error: NON_RICONOSCIUTO };
  }
  return parseColumnCsv(text);
}

export function parse(files: SourceFile[]): ParsedSource {
  const candidates: ImportCandidate[] = [];
  let rows = 0;
  let error: string | undefined;
  for (const file of files) {
    const out = parseOne(file);
    candidates.push(...out.candidates);
    rows += out.rows;
    error ??= out.error;
  }
  if (candidates.length > 0) return { candidates, rows };
  return { candidates: [], rows, error: error ?? NON_RICONOSCIUTO };
}
