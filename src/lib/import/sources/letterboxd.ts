/**
 * Export Letterboxd: quattro csv indipendenti che parlano degli stessi film.
 * `watched` dice cosa, `ratings` con che voto, `diary` quando davvero (la data di
 * `watched` è quella in cui il film è stato segnato, non vista), `watchlist` cosa
 * si vuole vedere. Solo film: Letterboxd non ha serie.
 */

import Papa from "papaparse";
import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import type { ParsedSource, SourceFile } from "./types";

const MANCANO_I_FILE =
  "Non trovo i file di Letterboxd (watched.csv, ratings.csv, diary.csv, watchlist.csv).";

interface Film {
  name: string;
  year: string | null;
  rating: number | null;
  date: string | null;
  /** Data presa dal diario: non deve essere sovrascritta da `watched.csv`. */
  dateFromDiary: boolean;
  seen: boolean;
}

/** "2024-03-04" o "2024-03-04 12:00" → "2024-03-04"; null se non è una data ISO. */
function isoDate(value: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  return match ? match[0] : null;
}

/** "3.5" → 7; fuori scala o non numerico → null. */
function stars(value: string | undefined): number | null {
  const n = Number.parseFloat((value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.max(1, Math.min(10, Math.round(n * 2)));
}

function rowsOf(text: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  }).data;
}

/** Un film vale per titolo + anno: due "Dune" di anni diversi sono due film. */
function keyOf(name: string, year: string | null): string {
  return `${normalizeTitle(name)}|${year ?? ""}`;
}

const CANONICI = ["watched", "ratings", "diary", "watchlist"] as const;
type Canonico = (typeof CANONICI)[number];

/**
 * Nome esatto, non "contiene": l'export vero porta anche `lists/<slug>.csv`
 * (le liste dell'utente, colonne `Position,Name,Year,URL`) e `archive.ts` tiene
 * solo il nome del file. Una lista chiamata "Watched in 2024" diventava
 * `watched-in-2024.csv` e finiva letta come `watched.csv`: ogni film dentro
 * entrava in libreria come visto, righe inventate che nessun reimport disfa.
 */
function fileKind(name: string): Canonico | null {
  const n = name.toLowerCase();
  return CANONICI.find((k) => n === `${k}.csv`) ?? null;
}

export function parse(files: SourceFile[]): ParsedSource {
  const films = new Map<string, Film>();
  let rows = 0;
  let letti = 0;

  function upsert(name: string, year: string | null): Film {
    const key = keyOf(name, year);
    let film = films.get(key);
    if (!film) {
      film = { name, year, rating: null, date: null, dateFromDiary: false, seen: false };
      films.set(key, film);
    }
    return film;
  }

  // ordine fisso: il diario arriva per ultimo e ha l'ultima parola sulla data
  const ordine: Canonico[] = ["watchlist", "watched", "ratings", "diary"];
  for (const kind of ordine) {
    for (const file of files) {
      if (fileKind(file.name) !== kind) continue;
      letti++;
      for (const row of rowsOf(file.text)) {
        const name = (row.Name ?? row.name ?? "").trim();
        if (!name) continue;
        rows++;
        const year = (row.Year ?? row.year ?? "").trim() || null;
        const film = upsert(name, year);
        if (kind === "watchlist") continue; // solo presenza: resta `seen: false`
        film.seen = true;
        const rating = stars(row.Rating ?? row.rating);
        if (rating != null) film.rating = rating;
        if (kind === "diary") {
          const watched = isoDate(row["Watched Date"] ?? row.Date);
          if (watched) {
            film.date = watched;
            film.dateFromDiary = true;
          }
        } else if (!film.dateFromDiary) {
          film.date = isoDate(row.Date ?? row.date) ?? film.date;
        }
      }
    }
  }

  if (letti === 0) return { candidates: [], rows: 0, error: MANCANO_I_FILE };

  const candidates: ImportCandidate[] = [];
  for (const [key, film] of films) {
    candidates.push({
      key: `movie:${key}`,
      netflixTitle: film.name,
      kind: "movie",
      season: null,
      episode: null,
      lastDate: film.seen ? film.date : null,
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: [],
      year: film.year,
      rating: film.seen ? film.rating : null,
      status: film.seen ? "watched" : "want",
    });
  }
  // più recenti prima, come fa il parser Netflix; la watchlist (senza data) in fondo
  candidates.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
  return { candidates, rows };
}
