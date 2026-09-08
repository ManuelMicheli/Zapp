import "server-only";

import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import { dominantColors, FALLBACK, type Palette } from "./dominant";

export { dominantColor, dominantColors, rgba, FALLBACK } from "./dominant";
export type { Palette } from "./dominant";

/** Locandina analizzata a bassa risoluzione: bastano poche migliaia di pixel. */
const SAMPLE_WIDTH = 40;
/** Cache Next della `fetch` dell'immagine (la locandina non cambia). */
const REVALIDATE_S = 30 * 24 * 60 * 60;

/**
 * Palette della locandina TMDB (versione `w92`, ~10 KB): dà a ogni scheda i propri
 * colori di sfondo. L'immagine passa dalla cache `fetch` di Next (30 giorni); il calcolo
 * su 40×60 pixel costa pochi millisecondi. Qualunque errore → tinta di ripiego, mai
 * un errore in pagina.
 */
async function computePosterPalette(posterPath: string): Promise<Palette> {
  try {
    const res = await fetch(`${TMDB_IMAGE_BASE}/w92${posterPath}`, {
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) return FALLBACK;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: SAMPLE_WIDTH })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return dominantColors(data, info.channels);
  } catch (error) {
    console.warn(`[palette] ${posterPath}:`, error);
    return FALLBACK;
  }
}

/**
 * Palette in cache dati Next per 30 giorni (chiave = poster_path): il calcolo con
 * `sharp` gira una volta per locandina, poi la scheda non aspetta più nulla.
 * `PALETTE_EPOCH` fa parte della chiave: alzarla quando cambiano le regole di
 * `dominant.ts`, altrimenti le schede già visitate restano coi vecchi colori.
 */
const PALETTE_EPOCH = "3";

const cachedPosterPalette = unstable_cache(
  computePosterPalette,
  ["poster-palette", PALETTE_EPOCH],
  { revalidate: REVALIDATE_S },
);

export async function getPosterPalette(posterPath: string | null): Promise<Palette> {
  if (!posterPath) return FALLBACK;
  try {
    return await cachedPosterPalette(posterPath);
  } catch {
    return FALLBACK;
  }
}
