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
import {
  durataSec,
  EPOCH,
  profilaColonne,
  scalaVotoDalNome,
  unitaDurata,
  type Ruolo,
} from "./sniff";
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

/**
 * Su che scala vota questa colonna: prima quello che dice il nome ("Voto /10",
 * "Stars"), poi il massimo osservato — ma solo se e' il massimo di una scala
 * plausibile. Un massimo di 18 non e' una scala: e' una classificazione per
 * eta' finita per sbaglio in questa colonna, e va lasciata fuori (null) invece
 * di riportarla su dieci inventando un voto.
 *
 * Resta ambiguo, e non si puo' risolvere guardando i dati: un file davvero su
 * 1-10 in cui nessuno ha mai votato sopra 4 si legge come cinque stelle e i
 * voti raddoppiano. Serve il nome della colonna per chiudere il caso, e quando
 * il nome non dice niente si sceglie la lettura piu' comune (chi ha una scala
 * a cinque stelle vota spesso 4).
 */
function scalaVoto(nome: string | null, valori: number[]): number | null {
  const dichiarata = nome ? scalaVotoDalNome(nome) : null;
  if (dichiarata != null) return dichiarata;
  if (valori.length === 0) return null;
  const massimo = Math.max(...valori);
  if (massimo <= 0) return null;
  if (massimo <= 5) return 5;
  if (massimo <= 10) return 10;
  if (massimo >= 50 && massimo <= 100) return 100;
  return null;
}

/** Riporta su 1-10 qualunque scala: 5 stelle, 10, 100. Senza scala, niente voto. */
function votoSuDieci(value: string | undefined, massimo: number | null): number | null {
  if (value == null || massimo == null) return null;
  const n = Number.parseFloat(value.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const fattore = massimo <= 5 ? 2 : massimo <= 10 ? 1 : 0.1;
  return Math.max(1, Math.min(10, Math.round(n * fattore)));
}

/**
 * Data normalizzata prima di `parseDate` (che vuole esattamente tre pezzi e
 * senza questo passaggio restituisce null su una ISO con i millisecondi o su un
 * epoch, lasciando entrare migliaia di titoli senza data). `parseDate` resta
 * com'e': la usa anche Netflix.
 */
export function normalizzaData(value: string): string {
  const testo = value.trim();
  if (testo === "") return "";
  if (EPOCH.test(testo)) {
    const ms = testo.length === 13 ? Number(testo) : Number(testo) * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  // "2026-09-01T21:14:00.000Z" e "2026-09-01 21:14:00" -> "2026-09-01": senza
  // il taglio, i millisecondi aggiungono un quarto pezzo e la data si perde
  return testo.split(/[T ]/)[0];
}

function valore(riga: Record<string, string>, ruoli: Map<string, Ruolo>, ruolo: Ruolo) {
  for (const [col, r] of ruoli) if (r === ruolo) return riga[col];
  return undefined;
}

/** Il nome della colonna che ha questo ruolo: serve a leggerne unita' e scala. */
function colonnaDi(ruoli: Map<string, Ruolo>, ruolo: Ruolo): string | null {
  for (const [col, r] of ruoli) if (r === ruolo) return col;
  return null;
}

/** Un anno che puo' essere l'anno di uscita di un titolo, non un numero qualunque. */
function annoPlausibile(value: string | undefined): string | null {
  const testo = (value ?? "").trim();
  if (!/^\d{4}$/.test(testo)) return null;
  const n = Number(testo);
  return n >= 1870 && n <= 2100 ? testo : null;
}

export function righeACandidati(righe: Record<string, string>[]): ImportCandidate[] {
  if (righe.length === 0) return [];
  const ruoli = profilaColonne(righe);
  const date = righe
    .map((r) => valore(r, ruoli, "data") ?? "")
    .filter((d) => d.trim() !== "")
    .map(normalizzaData);
  const ordine = inferDateOrder(date);
  const colVoto = colonnaDi(ruoli, "voto");
  const voti = righe
    .map((r) => Number.parseFloat((valore(r, ruoli, "voto") ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const votoMax = scalaVoto(colVoto, voti);
  // l'unita' della colonna della durata si decide una volta per file: dal nome
  // se lo dichiara ("Minutes watched"), altrimenti dalla mediana. Senza,
  // `DURATA_MINIMA_SEC` confrontava minuti con secondi e una piattaforma che
  // conta in minuti perdeva **tutte** le righe, con un errore che diceva il
  // contrario ("non ho trovato una cronologia").
  const colDurata = colonnaDi(ruoli, "durata");
  const unita = colDurata
    ? unitaDurata(
        colDurata,
        righe.slice(0, 200).map((r) => String(r[colDurata] ?? "")),
      )
    : "secondi";

  const out: ImportCandidate[] = [];
  for (const riga of righe) {
    const grezzo = (valore(riga, ruoli, "titolo") ?? "").trim();
    if (grezzo === "") continue;

    const durata = durataSec(valore(riga, ruoli, "durata"), unita);
    if (durata != null && durata < DURATA_MINIMA_SEC) continue;

    const diviso = splitTitolo(grezzo);
    const tipo = (valore(riga, ruoli, "tipo") ?? "").toLowerCase();
    const stagioneCol = Number.parseInt(valore(riga, ruoli, "stagione") ?? "", 10);
    const episodioCol = Number.parseInt(valore(riga, ruoli, "episodio") ?? "", 10);
    const season = Number.isFinite(stagioneCol) ? stagioneCol : diviso.season;
    const episode = Number.isFinite(episodioCol) ? episodioCol : diviso.episode;
    // un valore di tipo che non riconosciamo ("SVOD", "RENTAL", "EST") e'
    // **ignoto**, non "film": forzare movie azzerava stagione ed episodio anche
    // quando erano scritti in chiaro nelle loro colonne.
    const tipoDice = /show|serie|tv|episod/.test(tipo)
      ? "tv"
      : /movie|film|feature|lungometrag/.test(tipo)
        ? "movie"
        : null;
    const kind: "movie" | "tv" =
      tipoDice ?? (season != null || episode != null ? "tv" : "movie");

    // il nome della puntata: prima la colonna dedicata (Apple TV, NOW lo
    // scrivono separato), altrimenti quello che sta dentro al titolo unico
    // (es. "Serie: Stagione 2: Episodio 5 - Nome").
    const episodioNomeCol = valore(riga, ruoli, "episodio_nome")?.trim();
    const episodeTitle = episodioNomeCol || diviso.episodeTitle;

    const avanzamento = frazione(valore(riga, ruoli, "progresso"));
    const anno = annoPlausibile(valore(riga, ruoli, "anno"));
    const data = parseDate(normalizzaData(valore(riga, ruoli, "data") ?? ""), ordine);

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

/**
 * Sotto questa quota di date davvero lette l'avviso parte: la colonna c'e', ma
 * il suo formato non si capisce e i titoli entrano senza data di visione (la
 * libreria si ordina a caso). L'avviso era agganciato al **ruolo**, quindi non
 * partiva mai: il ruolo veniva assegnato lo stesso.
 */
const QUOTA_DATE_MINIMA = 0.5;

/** Frazione di righe non vuote la cui data si legge davvero (0-1). */
export function quotaDateLette(righe: Record<string, string>[]): number {
  const ruoli = profilaColonne(righe);
  const valori = righe
    .map((r) => (valore(r, ruoli, "data") ?? "").trim())
    .filter((v) => v !== "")
    .map(normalizzaData);
  if (valori.length === 0) return 0;
  const ordine = inferDateOrder(valori);
  return valori.filter((v) => parseDate(v, ordine) != null).length / valori.length;
}

/** Una tabella e' una cronologia se ha un titolo e almeno una data o una durata. */
function sembraCronologia(righe: Record<string, string>[]): boolean {
  const ruoli = [...profilaColonne(righe).values()];
  return ruoli.includes("titolo") && (ruoli.includes("data") || ruoli.includes("durata"));
}

/**
 * Il primo array di oggetti che e' una cronologia vera (titolo + data/durata),
 * max 4 livelli. Non si ferma al primo array qualunque: un export che mette
 * `devices`/`settings` prima di `history` (Apple, Disney+, NOW, Prime lo fanno
 * tutti) deve saltarlo e continuare a cercare, non restituirlo e farlo scartare
 * da `sembraCronologia` a valle — altrimenti la cronologia vera, che sta
 * dopo, non si legge mai.
 */
function primoElenco(value: unknown, livello = 0): Record<string, string>[] | null {
  if (livello > 4) return null;
  if (Array.isArray(value)) {
    const oggetti = value.filter(isRecord);
    if (oggetti.length === 0) return null;
    const righe = oggetti.map((o) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? "")])),
    );
    return sembraCronologia(righe) ? righe : null;
  }
  if (!isRecord(value)) return null;
  for (const dentro of Object.values(value)) {
    const trovato = primoElenco(dentro, livello + 1);
    if (trovato) return trovato;
  }
  return null;
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
    } else if (quotaDateLette(righe) < QUOTA_DATE_MINIMA) {
      avvisi.push(
        `In ${file.name} c'e' una colonna di date ma non riesco a leggerne il formato: i titoli entrano senza data di visione.`,
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
