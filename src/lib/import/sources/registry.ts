/**
 * Le sorgenti di import in un posto solo: slug (che è anche il valore in
 * `imports.source` e il segmento di rotta), marchio, istruzioni e parser.
 * Aggiungere una sorgente domani è una voce qui più un file accanto.
 */

import * as generic from "./generic";
import * as letterboxd from "./letterboxd";
import { groupRows, parseNetflixCsvText } from "./netflix";
import * as tvtime from "./tvtime";
import type { ParsedSource, SourceFile } from "./types";

export const SOURCE_SLUGS = ["netflix", "letterboxd", "tvtime", "file"] as const;
export type SourceSlug = (typeof SOURCE_SLUGS)[number];

export interface SourceMeta {
  slug: SourceSlug;
  /** Nome della piattaforma, per le schede dell'hub. */
  nome: string;
  /** Titolo della pagina e della scheda. */
  titolo: string;
  /** Una riga sotto il nome nell'hub. */
  descrizione: string;
  /** Estensioni accettate dall'input file. */
  accetta: string;
  /** Più file insieme (Letterboxd ne ha quattro). */
  multiplo: boolean;
  /** Passi numerati nel riquadro istruzioni. */
  istruzioni: string[];
  /** Testo del bottone. */
  bottone: string;
  /** File di esempio scaricabile, servito da `public/`. */
  esempio?: string;
}

const META: Record<SourceSlug, SourceMeta> = {
  netflix: {
    slug: "netflix",
    nome: "Netflix",
    titolo: "Importa da Netflix",
    descrizione: "La cronologia di visione.",
    accetta: ".csv,text/csv",
    multiplo: false,
    istruzioni: [
      "Netflix → Account → Profilo → Attività di visione",
      'In fondo, "Scarica tutto"',
      "Carica qui il file NetflixViewingHistory.csv",
    ],
    bottone: "Scegli il file CSV",
  },
  letterboxd: {
    slug: "letterboxd",
    nome: "Letterboxd",
    titolo: "Importa da Letterboxd",
    descrizione: "Film visti, voti e watchlist.",
    accetta: ".csv,.zip,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "Letterboxd → Settings → Data → Export your data",
      "Arriva uno zip: caricalo così com'è",
      "Oppure apri lo zip e trascina qui watched.csv, ratings.csv, diary.csv, watchlist.csv",
    ],
    bottone: "Scegli lo zip o i CSV",
  },
  tvtime: {
    slug: "tvtime",
    nome: "TV Time",
    titolo: "Importa da TV Time",
    descrizione: "Serie e film visti, con i voti.",
    accetta: ".csv,.zip,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "TV Time → Impostazioni → Privacy → Scarica i tuoi dati",
      "L'export arriva per email, di solito entro un giorno",
      "Carica qui lo zip o il csv che trovi dentro",
    ],
    bottone: "Scegli lo zip o il CSV",
  },
  file: {
    slug: "file",
    nome: "File",
    titolo: "Importa da un file",
    descrizione: "Backup di Zapp, JSON o CSV.",
    accetta: ".json,.csv,.zip,application/json,text/csv,application/zip",
    multiplo: true,
    istruzioni: [
      "Il backup scaricato da Zapp (Profilo → Esporta i tuoi dati)",
      "Oppure un JSON con voci {title, year, type, season, episode, rating, date}",
      "Oppure un CSV con le colonne title, type, season, episode, watched_date, rating",
    ],
    bottone: "Scegli il file",
    esempio: "/info/tvtime_export_example.csv",
  },
};

export const SOURCES = META;
export const SOURCE_LIST: SourceMeta[] = SOURCE_SLUGS.map((slug) => META[slug]);

export function isSourceSlug(value: string): value is SourceSlug {
  return (SOURCE_SLUGS as readonly string[]).includes(value);
}

/** Il CSV di Netflix ha due colonne precise: dirlo evita mezz'ora di prove. */
const NETFLIX_CSV_INVALIDO =
  "CSV vuoto o formato non riconosciuto (attese colonne Title, Date).";

/** Netflix non ha una `parse(files)`: l'adattatore sta qui, non nel parser. */
function parseNetflix(files: SourceFile[]): ParsedSource {
  const rows = files.flatMap((file) => parseNetflixCsvText(file.text));
  if (rows.length === 0) {
    return { candidates: [], rows: 0, error: NETFLIX_CSV_INVALIDO };
  }
  return { candidates: groupRows(rows), rows: rows.length };
}

export function parseSource(slug: SourceSlug, files: SourceFile[]): ParsedSource {
  switch (slug) {
    case "netflix":
      return parseNetflix(files);
    case "letterboxd":
      return letterboxd.parse(files);
    case "tvtime":
      return tvtime.parse(files);
    case "file":
      return generic.parse(files);
  }
}
