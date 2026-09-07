import { weightOf, type TasteRow } from "./weights";

/**
 * Il profilo di gusto: `buildTasteProfile` prende i segnali già aggregati dal database
 * e i metadati dei titoli, e ne fa vettori normalizzati.
 *
 * Funzione **pura**: nessun accesso a rete o database, così l'unica parte che decide
 * "chi è questo utente" si può provare con dati finti e leggere in un test.
 */

export interface TitleMeta {
  mediaType: "movie" | "tv";
  genreIds: number[];
  year: number | null;
  runtime: number | null;
  providerIds: number[];
  /** Etichette già pronte, es. `Regia:Denis Villeneuve`. */
  people: string[];
  originalLanguage: string | null;
}

export interface TasteInput {
  birthYear: number | null;
  rows: TasteRow[];
  /** Chiave `metaKey(mediaType, titleId)`. I titoli senza metadati sono ammessi. */
  meta: Map<string, TitleMeta>;
  now: Date;
}

export interface TasteProfile {
  generi: Record<string, number>;
  decenni: Record<string, number>;
  provider: Record<string, number>;
  persone: Record<string, number>;
  tipo: Record<string, number>;
  runtime: Record<string, number>;
  lingua: Record<string, number>;
  /** Quota di peso su titoli usciti negli ultimi 24 mesi, 0-1. */
  novita: number;
  /** Somma dei pesi positivi: quanto ci si può fidare di questo profilo. */
  massa: number;
  eventiContati: number;
}

/** Quanti anni indietro conta come "novità". */
const NOVITA_ANNI = 2;
/** Quanto pesa il prior generazionale, in frazione della massa. */
const PRIOR_ETA = 0.03;
/** Sotto questa quota una voce è rumore e sporcherebbe la riga senza spostare nulla. */
const SOGLIA_RUMORE = 0.005;

export function metaKey(mediaType: "movie" | "tv", titleId: number): string {
  return `${mediaType}-${titleId}`;
}

export function runtimeBucket(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 95) return "corto";
  if (minutes <= 135) return "medio";
  return "lungo";
}

export function decadeOf(year: number | null): string | null {
  if (!year) return null;
  return String(Math.floor(year / 10) * 10);
}

/** Somma pesata su una dimensione. */
function add(map: Map<string, number>, key: string | null, weight: number) {
  if (key === null) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/**
 * Normalizza dividendo per la **massa positiva**: le voci positive sommano a 1, quelle
 * negative restano negative e dicono "questo no". Normalizzare sul valore assoluto
 * avrebbe schiacciato i sì di un utente con molti rifiuti.
 */
function normalize(map: Map<string, number>, massa: number): Record<string, number> {
  if (massa <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of map) {
    const q = v / massa;
    if (Math.abs(q) >= SOGLIA_RUMORE) out[k] = Number(q.toFixed(4));
  }
  return out;
}

export function buildTasteProfile(input: TasteInput): TasteProfile {
  const { rows, meta, now, birthYear } = input;

  const generi = new Map<string, number>();
  const decenni = new Map<string, number>();
  const provider = new Map<string, number>();
  const persone = new Map<string, number>();
  const tipo = new Map<string, number>();
  const runtime = new Map<string, number>();
  const lingua = new Map<string, number>();

  let massa = 0;
  let pesoNovita = 0;
  let eventiContati = 0;

  const annoCorrente = now.getUTCFullYear();

  for (const row of rows) {
    eventiContati +=
      row.impressionSessions +
      row.opens +
      row.providerOpens +
      row.trailers +
      row.dismisses;

    const w = weightOf(row, now);
    if (w === 0) continue;
    if (w > 0) massa += w;

    const m = meta.get(metaKey(row.mediaType, row.titleId));
    if (!m) continue;

    for (const g of m.genreIds) add(generi, String(g), w);
    add(decenni, decadeOf(m.year), w);
    for (const p of m.providerIds) add(provider, String(p), w);
    for (const p of m.people) add(persone, p, w);
    add(tipo, m.mediaType, w);
    add(runtime, runtimeBucket(m.runtime), w);
    add(lingua, m.originalLanguage, w);

    if (w > 0 && m.year !== null && annoCorrente - m.year <= NOVITA_ANNI) {
      pesoNovita += w;
    }
  }

  // Prior generazionale: i decenni fra i 12 e i 25 anni dell'utente prendono una
  // spinta pari al 3% della massa, divisa fra loro. Leggero apposta — la nostalgia
  // esiste, ma quello che uno guarda davvero deve poterla superare sempre.
  if (birthYear && massa > 0) {
    const chiavi = new Set<string>();
    for (let eta = 12; eta <= 25; eta++) {
      const d = decadeOf(birthYear + eta);
      if (d) chiavi.add(d);
    }
    const quota = (massa * PRIOR_ETA) / Math.max(1, chiavi.size);
    for (const d of chiavi) add(decenni, d, quota);
  }

  return {
    generi: normalize(generi, massa),
    decenni: normalize(decenni, massa),
    provider: normalize(provider, massa),
    persone: normalize(persone, massa),
    tipo: normalize(tipo, massa),
    runtime: normalize(runtime, massa),
    lingua: normalize(lingua, massa),
    novita: massa > 0 ? Number((pesoNovita / massa).toFixed(4)) : 0,
    massa: Number(massa.toFixed(3)),
    eventiContati,
  };
}
