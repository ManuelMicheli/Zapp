/**
 * Proposte di import (candidato + esito del riconoscimento) e loro fusione.
 * Senza `server-only` e senza papaparse: la usa anche il client dopo l'ultimo
 * blocco di riconoscimento. Coperta da Vitest.
 */

import type { ImportCandidate } from "./netflix-rows";

function laterDate(a: string | null, b: string): string | null {
  if (!b) return a;
  return !a || b > a ? b : a;
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
 * Pura: il client la applica dopo l'ultimo blocco di riconoscimento.
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
