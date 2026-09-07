import type { TmdbImage } from "./types";

/** Sotto questa larghezza una grafica non regge una card 16:9 su desktop a DPR alto. */
export const MIN_BACKDROP_WIDTH = 1920;
/** Quante grafiche tenere per titolo: la rotazione non ha bisogno di più. */
export const MAX_BACKDROPS = 8;

/**
 * Grafiche ufficiali di un titolo in ordine di bontà come fondale: prima quelle
 * senza scritte (`iso_639_1` null: è l'artwork pulito, quello che usa Netflix),
 * poi per voto della community e larghezza. Sotto `MIN_BACKDROP_WIDTH` si scarta,
 * ma se nessuna arriva a quella misura si tiene comunque il meglio: una card con
 * la grafica giusta un po' più piccola batte una card vuota.
 */
export function rankBackdrops(
  images: TmdbImage[],
  { minWidth = MIN_BACKDROP_WIDTH, max = MAX_BACKDROPS } = {},
): string[] {
  const wide = images.filter((i) => i.width >= minWidth);
  const pool = wide.length > 0 ? wide : images;
  return [...pool]
    .sort((a, b) => {
      const textless = Number(b.iso_639_1 == null) - Number(a.iso_639_1 == null);
      if (textless !== 0) return textless;
      if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
      return b.width - a.width;
    })
    .slice(0, max)
    .map((i) => i.file_path);
}

/**
 * Elemento della rotazione: `seed` cresce di uno a ogni resa della home, così a
 * ogni visita la fila mostra un'altra grafica; sommandogli l'id del titolo, due
 * card vicine non cambiano mai in sincrono.
 */
export function pickRotating<T>(items: T[], seed: number): T | null {
  if (items.length === 0) return null;
  const i = ((Math.trunc(seed) % items.length) + items.length) % items.length;
  return items[i];
}
