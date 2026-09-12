/**
 * Proposte di import (candidato + esito del riconoscimento) e loro fusione.
 * Senza `server-only` e senza papaparse: la usa anche il client dopo l'ultimo
 * blocco di riconoscimento. Coperta da Vitest.
 */

export interface ImportCandidate {
  key: string;
  /** Titolo come lo scrive la sorgente (il nome del campo è storico: vale per tutte). */
  netflixTitle: string;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  rowCount: number;
  /** Serie con stagione dal nome proprio: da provare su TMDB prima di `netflixTitle`. */
  altTitle: string | null;
  /** Film "A: B": A, da provare come serie se B non è un film. */
  fallbackShow: string | null;
  /** Nomi degli episodi visti nella stagione più avanzata. Vuoto per i film. */
  episodeTitles: string[];
  /** Già noto (TV Time, backup Zapp): salta del tutto il riconoscimento TMDB. */
  tmdbId?: number | null;
  /** Voto già sulla scala di Zapp (1-10). Non sovrascrive mai quello dell'utente. */
  rating?: number | null;
  /** Default "watched". "want" = watchlist: non è mai stato visto. */
  status?: "watched" | "want";
  /** Anno di uscita dichiarato dalla sorgente: restringe la ricerca TMDB. */
  year?: string | null;
}

function laterDate(a: string | null, b: string): string | null {
  if (!b) return a;
  return !a || b > a ? b : a;
}

/** Il voto più alto fra i due: una riga senza voto non cancella quello dell'altra. */
function maxRating(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const max = Math.max(a ?? 0, b ?? 0);
  return max > 0 ? max : null;
}

export interface ImportProposal extends ImportCandidate {
  tmdbId: number | null;
  matchedTitle: string | null;
  posterPath: string | null;
  year: string | null;
  /** false: riconoscimento non letterale, l'interfaccia mostra il titolo Netflix */
  exact: boolean;
  /** Film "A: B" riconosciuto come episodio della serie A */
  viaFallback: boolean;
}

/**
 * Unisce le proposte che puntano allo stesso titolo TMDB: film scritti in due
 * modi, episodi "A: B" riconosciuti a ripiego come serie A (uno per riga → si
 * sommano), episodi a ripiego più la serie vera (resta il progresso della serie).
 * Voto e stato si fondono per non perdere la riga più informata: vince il voto
 * più alto e "visto" batte "da vedere". Pura: il client la applica dopo l'ultimo
 * blocco di riconoscimento.
 */
export function mergeProposals(proposals: ImportProposal[]): ImportProposal[] {
  const out: ImportProposal[] = [];
  const byTitle = new Map<string, number>(); // "kind:tmdbId" → indice in out

  for (const p of proposals) {
    if (p.tmdbId == null) {
      out.push(p);
      continue;
    }
    const id = `${p.kind}:${p.tmdbId}`;
    const idx = byTitle.get(id);
    if (idx == null) {
      byTitle.set(id, out.length);
      out.push(p);
      continue;
    }
    const kept = out[idx];
    const merged: ImportProposal = {
      ...kept,
      rowCount: kept.rowCount + p.rowCount,
      lastDate: laterDate(kept.lastDate, p.lastDate ?? ""),
      exact: kept.exact && p.exact,
      rating: maxRating(kept.rating, p.rating),
      // "voglio vederlo" perde sempre contro "visto": senza, bastava che la riga
      // della watchlist arrivasse per prima (i `giaNoti` sono in testa) perché un
      // titolo già visto rientrasse in libreria come da vedere. Lo stato assente
      // vale "watched" (vedi `ImportCandidate.status`).
      status: kept.status === "want" && p.status === "want" ? "want" : "watched",
    };
    if (p.kind === "tv") {
      if (kept.viaFallback && p.viaFallback) {
        merged.episode = (kept.episode ?? 1) + (p.episode ?? 1);
      } else if (kept.viaFallback && !p.viaFallback) {
        merged.season = p.season;
        merged.episode = p.episode;
        merged.viaFallback = false;
      } else if (!kept.viaFallback && !p.viaFallback) {
        const ahead =
          (p.season ?? 0) > (kept.season ?? 0) ||
          ((p.season ?? 0) === (kept.season ?? 0) &&
            (p.episode ?? 0) > (kept.episode ?? 0));
        if (ahead) {
          merged.season = p.season;
          merged.episode = p.episode;
        }
      }
    }
    out[idx] = merged;
  }
  return out;
}
