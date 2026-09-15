/**
 * Export di cronologia di una piattaforma qualunque: Apple, Disney+, NOW, Prime
 * o chiunque altro. Le colonne si riconoscono con `sniff.ts`, l'episodio dentro
 * al titolo con `titolo.ts`. Pura, coperta da Vitest.
 *
 * Le due regole che tengono pulita la libreria: sotto i due minuti e' un
 * trailer (stessa soglia dello scrobble), e sotto l'85% di avanzamento il
 * titolo e' "in corso", non "visto".
 */

import Papa from "papaparse";
import type { ImportCandidate } from "../candidate";
import { maxRating, statoPiuForte } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import { splitTitolo } from "../titolo";
import { inferDateOrder, parseDate } from "./netflix";
import { durataSec, profilaColonne, type Ruolo } from "./sniff";
import type { ParsedSource, SourceFile } from "./types";

/** Quanti nomi di file scartati elencare prima di riassumere col conteggio. */
const MAX_SCARTATI_ELENCATI = 5;

const NIENTE_DI_UTILE =
  "In questo export non ho trovato una cronologia: cercavo una tabella con " +
  "almeno una colonna di titoli e una di date o durate.";

/** Sotto questa durata la riga e' un'anteprima: si butta. */
export const DURATA_MINIMA_SEC = 120;

/** Sotto questa frazione di avanzamento il titolo resta "in corso". */
export const PROGRESSO_VISTO = 0.85;

/** Nomi di episodio tenuti per candidato: oltre, `getSeason` non serve di piu'. */
const MAX_NOMI_EPISODIO = 60;

/** "40%" | "0.4" | "40" -> 0.4; quello che non si capisce -> null. */
function frazione(value: string | undefined): number | null {
  if (value == null) return null;
  const testo = value.trim().replace(",", ".");
  if (testo === "") return null;
  const n = Number.parseFloat(testo.replace("%", ""));
  if (!Number.isFinite(n) || n < 0) return null;
  if (testo.includes("%")) return n / 100;
  return n <= 1 ? n : n / 100;
}

/** Riporta su 1-10 qualunque scala: 5 stelle, 10, 100. */
function votoSuDieci(value: string | undefined, massimo: number): number | null {
  if (value == null) return null;
  const n = Number.parseFloat(value.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const fattore = massimo <= 5 ? 2 : massimo <= 10 ? 1 : 0.1;
  return Math.max(1, Math.min(10, Math.round(n * fattore)));
}

function valore(riga: Record<string, string>, ruoli: Map<string, Ruolo>, ruolo: Ruolo) {
  for (const [col, r] of ruoli) if (r === ruolo) return riga[col];
  return undefined;
}

export function righeACandidati(righe: Record<string, string>[]): ImportCandidate[] {
  if (righe.length === 0) return [];
  const ruoli = profilaColonne(righe);
  const date = righe
    .map((r) => valore(r, ruoli, "data") ?? "")
    .filter((d) => d.trim() !== "");
  const ordine = inferDateOrder(date);
  const voti = righe
    .map((r) => Number.parseFloat((valore(r, ruoli, "voto") ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const votoMax = voti.length > 0 ? Math.max(...voti) : 10;

  const out: ImportCandidate[] = [];
  for (const riga of righe) {
    const grezzo = (valore(riga, ruoli, "titolo") ?? "").trim();
    if (grezzo === "") continue;

    const durata = durataSec(valore(riga, ruoli, "durata"));
    if (durata != null && durata < DURATA_MINIMA_SEC) continue;

    const diviso = splitTitolo(grezzo);
    const tipo = (valore(riga, ruoli, "tipo") ?? "").toLowerCase();
    const stagioneCol = Number.parseInt(valore(riga, ruoli, "stagione") ?? "", 10);
    const episodioCol = Number.parseInt(valore(riga, ruoli, "episodio") ?? "", 10);
    const season = Number.isFinite(stagioneCol) ? stagioneCol : diviso.season;
    const episode = Number.isFinite(episodioCol) ? episodioCol : diviso.episode;
    const kind: "movie" | "tv" =
      tipo !== ""
        ? /show|serie|tv|episode/.test(tipo)
          ? "tv"
          : "movie"
        : season != null || episode != null
          ? "tv"
          : "movie";

    // il nome della puntata: prima la colonna dedicata (Apple TV, NOW lo
    // scrivono separato), altrimenti quello che sta dentro al titolo unico
    // (es. "Serie: Stagione 2: Episodio 5 - Nome").
    const episodioNomeCol = valore(riga, ruoli, "episodio_nome")?.trim();
    const episodeTitle = episodioNomeCol || diviso.episodeTitle;

    const avanzamento = frazione(valore(riga, ruoli, "progresso"));
    const anno = (valore(riga, ruoli, "anno") ?? "").trim() || null;
    const data = parseDate(valore(riga, ruoli, "data") ?? "", ordine);

    out.push({
      key: `${kind}:${normalizeTitle(diviso.show)}|${anno ?? ""}`,
      netflixTitle: diviso.show,
      kind,
      season: kind === "tv" ? (season ?? 1) : null,
      episode: kind === "tv" ? (episode ?? 1) : null,
      lastDate: data,
      rowCount: 1,
      altTitle: null,
      fallbackShow: null,
      episodeTitles: episodeTitle ? [episodeTitle] : [],
      rating: votoSuDieci(valore(riga, ruoli, "voto"), votoMax),
      status:
        avanzamento != null && avanzamento < PROGRESSO_VISTO ? "watching" : "watched",
      year: anno,
    });
  }
  return out;
}

/**
 * Una riga per episodio diventa un candidato per serie. Tiene la stagione piu'
 * avanti, somma le righe e raccoglie i nomi degli episodi **di quella
 * stagione**: sono quelli che `resolveEpisodeNumber` cerca su TMDB per sapere a
 * che punto e' arrivato l'utente, invece di contare le righe.
 */
export function raggruppa(candidati: ImportCandidate[]): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  const indice = new Map<string, number>();

  for (const c of candidati) {
    const idx = indice.get(c.key);
    if (idx == null) {
      indice.set(c.key, out.length);
      out.push({ ...c, episodeTitles: [...c.episodeTitles] });
      continue;
    }
    const tenuto = out[idx];
    tenuto.rowCount += c.rowCount;
    if (c.lastDate && (!tenuto.lastDate || c.lastDate > tenuto.lastDate)) {
      tenuto.lastDate = c.lastDate;
    }
    tenuto.rating = maxRating(tenuto.rating, c.rating);
    tenuto.status = statoPiuForte(tenuto.status, c.status);
    if (c.kind !== "tv") continue;

    const avanti =
      (c.season ?? 0) > (tenuto.season ?? 0) ||
      ((c.season ?? 0) === (tenuto.season ?? 0) &&
        (c.episode ?? 0) > (tenuto.episode ?? 0));
    if ((c.season ?? 0) > (tenuto.season ?? 0)) {
      // stagione nuova: i nomi della precedente non servono piu'
      tenuto.episodeTitles = [];
    }
    if ((c.season ?? 0) === (tenuto.season ?? 0) || avanti) {
      for (const nome of c.episodeTitles) {
        if (tenuto.episodeTitles.length >= MAX_NOMI_EPISODIO) break;
        if (!tenuto.episodeTitles.includes(nome)) {
          tenuto.episodeTitles.push(nome);
        }
      }
    }
    if (avanti) {
      tenuto.season = c.season;
      tenuto.episode = c.episode;
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** CSV → righe: nomi di colonna originali, per lo sniffer per nome e per contenuto. */
function parseCsvRows(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

/** Il primo array di oggetti con un campo che somiglia a un titolo, max 4 livelli. */
function primoElenco(value: unknown, livello = 0): Record<string, string>[] | null {
  if (livello > 4) return null;
  if (Array.isArray(value)) {
    const oggetti = value.filter(isRecord);
    if (oggetti.length === 0) return null;
    const righe = oggetti.map((o) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? "")])),
    );
    return profilaColonne(righe).size > 0 ? righe : null;
  }
  if (!isRecord(value)) return null;
  for (const dentro of Object.values(value)) {
    const trovato = primoElenco(dentro, livello + 1);
    if (trovato) return trovato;
  }
  return null;
}

/** Una tabella e' una cronologia se ha un titolo e almeno una data o una durata. */
function sembraCronologia(righe: Record<string, string>[]): boolean {
  const ruoli = [...profilaColonne(righe).values()];
  return ruoli.includes("titolo") && (ruoli.includes("data") || ruoli.includes("durata"));
}

/**
 * Sceglie da solo, dentro un archivio con decine di file, quelli che sono
 * cronologie (CSV o JSON annidato) e ignora il resto — fatture, elenchi di
 * dispositivi, impostazioni — dicendolo negli avvisi invece di fermare tutto.
 */
export function parse(files: SourceFile[]): ParsedSource {
  const avvisi: string[] = [];
  const scartati: string[] = [];
  let candidati: ImportCandidate[] = [];
  let rows = 0;

  for (const file of files) {
    const testo = file.text.trim();
    let righe: Record<string, string>[] | null = null;
    if (testo.startsWith("{") || testo.startsWith("[")) {
      try {
        righe = primoElenco(JSON.parse(testo));
      } catch {
        righe = null;
      }
    } else {
      righe = parseCsvRows(testo);
    }
    if (!righe || righe.length === 0 || !sembraCronologia(righe)) {
      scartati.push(file.name);
      continue;
    }
    rows += righe.length;
    candidati.push(...righeACandidati(righe));
    if (![...profilaColonne(righe).values()].includes("data")) {
      avvisi.push(
        `In ${file.name} non ho trovato la colonna della data: i titoli entrano senza data di visione.`,
      );
    }
  }

  if (scartati.length > 0) {
    avvisi.push(
      "Ignorati perche' non sembrano cronologie: " +
        scartati.slice(0, MAX_SCARTATI_ELENCATI).join(", ") +
        (scartati.length > MAX_SCARTATI_ELENCATI
          ? ` e altri ${scartati.length - MAX_SCARTATI_ELENCATI}`
          : ""),
    );
  }
  candidati = raggruppa(candidati);
  if (candidati.length === 0) {
    return { candidates: [], rows, error: NIENTE_DI_UTILE, avvisi };
  }
  return { candidates: candidati, rows, avvisi };
}
