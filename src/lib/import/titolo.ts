/**
 * Stacca stagione, episodio e nome dell'episodio da un titolo scritto in una
 * riga sola. Ogni export ha la sua forma: `S02E05`, `1x03`, "Stagione 1:
 * Episodio 3", "Season 3, Episode 12", "- Ep. 4". Quello che resta e' la serie.
 *
 * Pura, coperta da Vitest. Il parsing riga per riga di Netflix resta dov'e'
 * (`sources/netflix.ts`): quello lavora su pezzi separati da ":", questo su una
 * stringa sola che contiene i numeri.
 */

export interface TitoloDiviso {
  show: string;
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
}

/**
 * Le forme osservate, in ordine di confidenza. Ognuna dice da sola se porta la
 * stagione: gli indici dei gruppi cambiano, e agganciare la semantica alla
 * posizione nell'elenco vuol dire che il primo riordino la sposta in silenzio.
 * - con stagione: m[1]=show, m[2]=season, m[3]=episode, m[4]=episodeTitle
 * - senza stagione: m[1]=show, m[2]=episode, m[3]=episodeTitle
 */
interface Forma {
  re: RegExp;
  /** La forma non ha il gruppo della stagione: l'episodio e' in m[2]. */
  senzaStagione?: boolean;
}

const FORME: Forma[] = [
  // "Serie: Stagione 1: Episodio 3 - Nome" / "Serie: Season 3, Episode 12: Nome"
  {
    re: /^(.+?)[:\-–,]\s*(?:stagione|season)\s*(\d{1,2})[\s:,\-–]+(?:episodio|episode|ep\.?)\s*(\d{1,3})(?:\s*[-–:]\s*(.+))?$/i,
  },
  // "Serie S02E05 - Nome"
  { re: /^(.+?)[\s:\-–]+s(\d{1,2})[\s.]?e(\d{1,3})(?:\s*[-–:]\s*(.+))?$/i },
  // "Serie 1x03 - Nome"
  { re: /^(.+?)[\s:\-–]+(\d{1,2})x(\d{1,3})(?:\s*[-–:]\s*(.+))?$/i },
  // "Serie - Ep. 4 - Nome" (nessuna stagione)
  {
    re: /^(.+?)[\s:\-–]+(?:episodio|episode|ep\.?)\s*(\d{1,3})(?:\s*[-–:]\s*(.+))?$/i,
    senzaStagione: true,
  },
];

function intero(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function splitTitolo(raw: string): TitoloDiviso {
  const testo = raw.trim();
  for (const forma of FORME) {
    const m = forma.re.exec(testo);
    if (!m) continue;

    const show = m[1].trim().replace(/[:\-–,]\s*$/, "");
    if (show === "") continue;

    // senza stagione gli indici scalano: m[1]=show, m[2]=episode, m[3]=episodeTitle
    if (forma.senzaStagione) {
      return {
        show,
        season: null,
        episode: intero(m[2]),
        episodeTitle: m[3]?.trim() || null,
      };
    }

    // con stagione: m[1]=show, m[2]=season, m[3]=episode, m[4]=episodeTitle
    return {
      show,
      season: intero(m[2]),
      episode: intero(m[3]),
      episodeTitle: m[4]?.trim() || null,
    };
  }
  return { show: testo, season: null, episode: null, episodeTitle: null };
}
