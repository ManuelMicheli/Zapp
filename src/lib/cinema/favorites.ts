// Cinema preferiti: funzioni pure (test Vitest). Al massimo 3 per utente
// (`cinema_favorites`, posizione 1–3): vengono sempre prima nelle liste, nell'ordine
// scelto; il resto resta per distanza.

import type { Cinema, CinemaShowtimes } from "./types";

export const MAX_FAVORITE_CINEMAS = 3;
export const TOO_MANY_FAVORITES = `Puoi scegliere fino a ${MAX_FAVORITE_CINEMAS} cinema preferiti`;

function rankOf(favIds: number[]): Map<number, number> {
  return new Map(favIds.map((id, i) => [id, i]));
}

/** Preferiti in testa (ordine di `favIds`), poi gli altri per distanza; marca `favorite`. */
export function orderCinemas(cinemas: Cinema[], favIds: number[]): Cinema[] {
  const rank = rankOf(favIds);
  return cinemas
    .map((c) => ({ ...c, favorite: rank.has(c.id) }))
    .sort((a, b) => {
      const ra = rank.get(a.id) ?? Infinity;
      const rb = rank.get(b.id) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.distanceKm - b.distanceKm;
    });
}

/** Come `orderCinemas`, per la lista orari di un film. */
export function orderShowtimes(
  items: CinemaShowtimes[],
  favIds: number[],
): CinemaShowtimes[] {
  const byId = new Map(items.map((i) => [i.cinema.id, i]));
  return orderCinemas(
    items.map((i) => i.cinema),
    favIds,
  ).map((cinema) => ({ cinema, showings: byId.get(cinema.id)?.showings ?? [] }));
}

/** Id del cinema più vicino (badge "Il più vicino"): coi preferiti in testa non è il primo. */
export function nearestCinemaId(
  cinemas: Pick<Cinema, "id" | "distanceKm">[],
): number | null {
  let best: Pick<Cinema, "id" | "distanceKm"> | null = null;
  for (const c of cinemas) {
    if (!best || c.distanceKm < best.distanceKm) best = c;
  }
  return best?.id ?? null;
}

/** Prima posizione libera fra 1 e `MAX_FAVORITE_CINEMAS`, null se sono tutte occupate. */
export function nextFreePosition(taken: number[]): number | null {
  for (let p = 1; p <= MAX_FAVORITE_CINEMAS; p++) {
    if (!taken.includes(p)) return p;
  }
  return null;
}
