/**
 * Export di cronologia di una piattaforma qualunque: Apple, Disney+, NOW, Prime
 * o chiunque altro. Le colonne si riconoscono con `sniff.ts`, l'episodio dentro
 * al titolo con `titolo.ts`. Pura, coperta da Vitest.
 *
 * Le due regole che tengono pulita la libreria: sotto i due minuti e' un
 * trailer (stessa soglia dello scrobble), e sotto l'85% di avanzamento il
 * titolo e' "in corso", non "visto".
 */

import type { ImportCandidate } from "../candidate";
import { normalizeTitle } from "../netflix-title";
import { splitTitolo } from "../titolo";
import { inferDateOrder, parseDate } from "./netflix";
import { durataSec, profilaColonne, type Ruolo } from "./sniff";

/** Sotto questa durata la riga e' un'anteprima: si butta. */
export const DURATA_MINIMA_SEC = 120;

/** Sotto questa frazione di avanzamento il titolo resta "in corso". */
export const PROGRESSO_VISTO = 0.85;

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
