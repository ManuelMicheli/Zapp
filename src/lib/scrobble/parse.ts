import type { ParsedMedia } from "./types";

// Riconoscimento stagione/episodio in due stringhe separate (show, detail):
// e' la forma che l'estensione del browser ricava da MediaSession/DOM, gia'
// divisa per sito. Il nucleo delle espressioni regolari viene dallo spike
// Android del 2026-09-04 (spec §14) ed e' rimasto invariato.

/**
 * Le forme in cui le piattaforme scrivono stagione ed episodio, in italiano e
 * inglese. L'ordine conta: le piu' specifiche vanno prima, altrimenti "2x04"
 * mangerebbe un pezzo di "S2 E4" o viceversa.
 */
const SEASON_EPISODE: RegExp[] = [
  /\bS(\d{1,2})\s*[:.]?\s*E(\d{1,3})\b/i, // S2:E4, S2E4, S02E04, S2 E4
  /\b(?:stagione|season|temporada|saison)\s*(\d{1,2})\s*[:,.\-–]?\s*(?:episodio|episode|ep\.?)\s*(\d{1,3})\b/i,
  /\bT(\d{1,2})\s*E(\d{1,3})\b/i, // T2 E4
  /\b(\d{1,2})x(\d{1,3})\b/i, // 2x04
];

/** Solo l'episodio, senza stagione: "Episodio 7", "Episode 7", "Ep. 7". */
const EPISODE_ONLY = /\b(?:episodio|episode|ep\.?)\s*(\d{1,3})\b/i;

/**
 * "E23" incollato subito al nome, senza spazio: quirk del DOM di Netflix, che
 * concatena l'h4 (nome pulito) e lo span (codice+nome dell'episodio) in un
 * unico elemento — il residuo dopo aver tolto l'h4 è "E23Episodio 23". Va
 * prima di EPISODE_ONLY: quella regola vuole la parola "episodio"/"episode"
 * con un confine davanti, che qui non c'è ("E23" è attaccato a "Episodio").
 */
const EPISODE_ATTACHED = /^E(\d{1,3})(?=\D|$)/i;

/** Separatori iniziali fra il codice dell'episodio (o la sua stagione) e il nome. */
const LEADING_SEPARATORS = /^[\s:·.\-–—]+/;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Toglie una coppia di virgolette che avvolge l'intera stringa: il pannello di
 * pausa di Netflix cita il nome dell'episodio fra virgolette dritte
 * (`S1:E23 "Episodio 23"`), che altrimenti finirebbero dentro `episodeName`.
 */
function stripQuotes(value: string): string {
  const m = value.match(/^["'](.*)["']$/);
  return m ? m[1].trim() : value;
}

/**
 * djb2 in esadecimale: stabile, sincrono, senza dipendenze — funziona anche
 * nel service worker dell'estensione, dove `node:crypto` non esiste.
 */
export function stableKey(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p === null ? "" : String(p))).join(" ");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * `show` e' il nome dell'opera (serie o film), `detail` cio' che la piattaforma
 * mostra accanto: il codice dell'episodio, il suo nome, o niente. Non inventa
 * mai: senza `show` il risultato e' "unknown" e chi chiama scarta l'evento.
 *
 * `kindHint` e' quello che il **sito** sa e il dettaglio non dice. Su Netflix
 * l'h4 dentro `[data-uia="video-title"]` esiste solo nelle serie, quindi la sua
 * presenza dimostra che e' una serie anche nei battiti in cui il codice
 * dell'episodio non e' leggibile (comandi del player nascosti). Senza questo,
 * `kind` veniva dedotto dal solo `detail` e una serie senza dettaglio passava
 * per film: la ricerca partiva su `search/movie` e non trovava niente, per
 * sempre. Assente (`null`) resta la deduzione dal dettaglio, che e' quanto
 * sanno le fonti che non distinguono.
 */
export function parseMedia(
  show: string | null,
  detail: string | null,
  kindHint: "movie" | "tv" | null = null,
): ParsedMedia {
  const title = clean(show);
  const rest = clean(detail);

  if (!title) {
    return {
      kind: "unknown",
      title: "",
      year: null,
      season: null,
      episode: null,
      episodeName: null,
      key: stableKey(["unknown"]),
    };
  }

  let season: number | null = null;
  let episode: number | null = null;
  let name = rest;

  for (const re of SEASON_EPISODE) {
    const m = rest.match(re);
    if (!m) continue;
    season = Number(m[1]);
    episode = Number(m[2]);
    name = rest.slice((m.index ?? 0) + m[0].length).replace(LEADING_SEPARATORS, "");
    break;
  }

  if (episode === null) {
    const m = rest.match(EPISODE_ATTACHED);
    if (m) {
      episode = Number(m[1]);
      name = rest.slice(m[0].length).replace(LEADING_SEPARATORS, "");
    }
  }

  if (episode === null) {
    const m = rest.match(EPISODE_ONLY);
    if (m) {
      episode = Number(m[1]);
      name = rest.slice((m.index ?? 0) + m[0].length).replace(LEADING_SEPARATORS, "");
    }
  }

  const episodeName = stripQuotes(clean(name)) || null;
  // Un episodio riconosciuto e' di per se' la prova che e' una serie, e batte
  // qualunque suggerimento contrario.
  const kind: ParsedMedia["kind"] =
    episode !== null || season !== null ? "tv" : (kindHint ?? (rest ? "tv" : "movie"));

  return {
    kind,
    title,
    year: null,
    season,
    episode,
    episodeName,
    key: stableKey([title, season, episode, episodeName]),
  };
}
