import "server-only";

import { getRatings, ratingKey } from "./queries";
import type { Scored } from "./types";

/**
 * Il voto che va sotto ogni copertina, ovunque: home, Scopri, Cerca, libreria,
 * profilo, simili. È lo ZappScore già calcolato in `title_ratings` — una lettura
 * sola per scaffale, mai una richiesta a MDBList: chi non ce l'ha ancora ricade sul
 * voto che si porta dietro (TMDB) o resta senza numero, come prima.
 */
export type { Scored };

/**
 * Attacca ZappScore e voti a una lista di titoli con **una query sola**. Le righe di
 * `title_ratings` pesano ~200 byte, quindi uno scaffale intero costa quanto una riga
 * di libreria: si può chiamare da ogni sezione senza pensarci.
 *
 * Un errore di lettura non fa saltare lo scaffale: torna la lista senza voti.
 */
export async function withScores<T extends { id: number; mediaType: "movie" | "tv" }>(
  items: T[],
): Promise<Scored<T>[]> {
  if (items.length === 0) return [];
  const ratings = await getRatings(
    items.map((i) => ({ id: i.id, mediaType: i.mediaType })),
  ).catch(() => new Map());

  return items.map((item) => {
    const row = ratings.get(ratingKey(item.id, item.mediaType));
    return {
      ...item,
      zappScore: row?.score ?? null,
      zappVotes: row?.score == null ? 0 : (row?.votes ?? 0),
    };
  });
}

/**
 * Come `withScores` ma per liste che non hanno `id`/`mediaType` con quei nomi: si
 * passa la chiave e si riceve la mappa da consultare a mano.
 */
export async function scoreMap(
  keys: { id: number; mediaType: "movie" | "tv" }[],
): Promise<Map<string, { score: number | null; votes: number }>> {
  const out = new Map<string, { score: number | null; votes: number }>();
  if (keys.length === 0) return out;
  const ratings = await getRatings(keys).catch(() => new Map());
  for (const [key, row] of ratings) {
    out.set(key, { score: row.score, votes: row.score == null ? 0 : row.votes });
  }
  return out;
}

/**
 * Attacca a una lista i voti già letti con `scoreMap`: serve dove le liste sono
 * tante ma i titoli si ripetono (le pillole di "Da vedere", una lista per
 * piattaforma), così la lettura resta una sola per sezione.
 */
export function applyScores<T extends { id: number; mediaType: "movie" | "tv" }>(
  items: T[],
  map: Map<string, { score: number | null; votes: number }>,
): Scored<T>[] {
  return items.map((item) => {
    const row = map.get(ratingKey(item.id, item.mediaType));
    return {
      ...item,
      zappScore: row?.score ?? null,
      zappVotes: row?.score == null ? 0 : row.votes,
    };
  });
}

export { ratingKey };
