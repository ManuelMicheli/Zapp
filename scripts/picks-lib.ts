/**
 * Il pezzo comune dei due generatori di liste curate — `build-mood-picks.ts` (i mood)
 * e `build-genre-picks.ts` (i generi della home): un seme scritto a mano ("Shining",
 * 1980) si risolve su TMDB e diventa una riga con id, locandina, generi e fama.
 *
 * Sta a parte perché le due liste sono la stessa idea applicata a due cataloghi: due
 * copie della stessa risoluzione si sarebbero disallineate al primo campo nuovo (è già
 * successo con `backdropPath`, aggiunto ai mood quando la fila è diventata un banner).
 */

import { writeFileSync } from "node:fs";
import { searchMovies, searchTv } from "../src/lib/tmdb/client";
import type { TmdbMovieResult, TmdbTvResult } from "../src/lib/tmdb/types";

export interface Seme {
  /** Come cercarlo su TMDB: titolo italiano o originale, quello che trova meglio. */
  q: string;
  /** Anno di uscita, per scartare i remake e gli omonimi. */
  anno: number;
  tipo: "movie" | "tv";
}

/** Un film e una serie, per scrivere gli elenchi senza rumore. */
export const f = (q: string, anno: number): Seme => ({ q, anno, tipo: "movie" });
export const s = (q: string, anno: number): Seme => ({ q, anno, tipo: "tv" });

export interface Pick {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  /** Il fondale disegna i banner; la trama gli sta sotto. */
  backdropPath: string | null;
  overview: string | null;
  year: string | null;
  genreIds: number[];
  /** Numero di voti su TMDB: la fama, misurata. */
  voti: number;
  voto: number | null;
}

function annoDi(r: TmdbMovieResult | TmdbTvResult): number | null {
  const d = "title" in r ? r.release_date : r.first_air_date;
  return d ? Number(d.slice(0, 4)) : null;
}

function normalizza(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nomiDi(r: TmdbMovieResult | TmdbTvResult): string[] {
  const out: string[] = [];
  if ("title" in r) {
    out.push(r.title);
    if (r.original_title) out.push(r.original_title);
  } else {
    out.push(r.name);
    if (r.original_name) out.push(r.original_name);
  }
  return out.filter(Boolean).map(normalizza);
}

/**
 * Il risultato giusto per un seme: **prima il nome, poi l'anno, poi la fama**.
 * L'anno da solo non basta: cercando "The Ring" con l'anno 2002 il primo risultato per
 * voti era "Il Signore degli Anelli - La Compagnia dell'Anello", uscito in Italia lo
 * stesso anno. Un titolo che non contiene nemmeno le parole cercate non è quel film.
 */
function scegli<T extends TmdbMovieResult | TmdbTvResult>(
  res: T[],
  q: string,
  anno: number,
): T | null {
  const cercato = normalizza(q);
  // Punteggio, non semplice inclusione: cercando "The Ring" il titolo originale del
  // Signore degli Anelli ("...the Fellowship of the Ring") *contiene* la stringa, e con
  // un filtro binario quel film si prendeva il primo posto della lista dell'orrore.
  const punti = (r: T): number =>
    Math.max(
      ...nomiDi(r).map((n) => {
        if (n === cercato) return 3;
        if (n.startsWith(cercato) || cercato.startsWith(n)) return 2;
        if (n.includes(cercato) || cercato.includes(n)) return 1;
        return 0;
      }),
    );
  const massimo = Math.max(...res.map(punti), 0);
  const base = massimo > 0 ? res.filter((r) => punti(r) === massimo) : res;
  const perAnno = base.filter((r) => {
    const a = annoDi(r);
    return a !== null && Math.abs(a - anno) <= 2;
  });
  const lista = perAnno.length > 0 ? perAnno : base;
  return lista.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0] ?? null;
}

export async function risolvi(seme: Seme): Promise<Pick | null> {
  // I due rami restano separati: `search/movie` e `search/tv` hanno tipi diversi, e
  // unirli prima della scelta faceva perdere a TypeScript quale dei due sta guardando.
  const r =
    seme.tipo === "movie"
      ? scegli((await searchMovies(seme.q)).results, seme.q, seme.anno)
      : scegli((await searchTv(seme.q)).results, seme.q, seme.anno);
  if (!r || !r.poster_path) return null;
  const nome = "title" in r ? r.title : r.name;
  const a = annoDi(r);
  return {
    id: r.id,
    mediaType: seme.tipo,
    title: nome,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path ?? null,
    overview: r.overview || null,
    year: a ? String(a) : null,
    genreIds: r.genre_ids ?? [],
    voti: r.vote_count ?? 0,
    voto: r.vote_average ?? null,
  };
}

/**
 * Risolve tutti gli elenchi e scrive il JSON. Un seme che TMDB non trova, o che risulta
 * troppo poco visto, viene **scartato con un avviso**: una lista curata con dentro un
 * titolo sbagliato è peggio di una lista corta.
 */
export async function buildPicks(
  semi: Record<string, Seme[]>,
  outPath: string,
  votiMinimi: number,
): Promise<void> {
  const out: Record<string, Pick[]> = {};
  for (const [chiave, elenco] of Object.entries(semi)) {
    const picks: Pick[] = [];
    for (const seme of elenco) {
      const p = await risolvi(seme).catch(() => null);
      if (!p) {
        console.warn(`  ! non risolto: ${seme.q} (${seme.anno})`);
        continue;
      }
      if (p.voti < votiMinimi) {
        console.warn(`  ! troppo poco visto (${p.voti} voti): ${p.title}`);
        continue;
      }
      const scarto = p.year && Math.abs(Number(p.year) - seme.anno) > 2 ? " ⚠ anno" : "";
      console.log(
        `  ${chiave.padEnd(18)} ${seme.q.padEnd(46)} → ${p.title} (${p.year}) ${p.voti} voti${scarto}`,
      );
      picks.push(p);
    }
    // la fama decide l'ordine di partenza; il gusto lo ritocca a runtime
    picks.sort((a, b) => b.voti - a.voti);
    out[chiave] = picks;
  }
  writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n", "utf8");
  const totale = Object.values(out).reduce((n, l) => n + l.length, 0);
  console.log(`\nscritti ${totale} titoli in ${outPath}`);
}
