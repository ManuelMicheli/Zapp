import "server-only";

import sharp from "sharp";
import { TMDB_IMAGE_BASE } from "@/lib/config";

/** Colori dominanti di una locandina, come `[r, g, b]` 0–255. */
export interface Palette {
  /** Tinta principale: la più presente fra quelle sature. */
  primary: [number, number, number];
  /** Seconda tinta, di tonalità diversa dalla prima (o una variante se non c'è). */
  secondary: [number, number, number];
}

/** Locandina analizzata a bassa risoluzione: bastano poche migliaia di pixel. */
const SAMPLE_WIDTH = 40;
/** Cache Next della `fetch` dell'immagine (la locandina non cambia). */
const REVALIDATE_S = 30 * 24 * 60 * 60;
/** Tinta di ripiego per locandine grigie/assenti: il viola tenue del brand, spento. */
const FALLBACK: Palette = { primary: [92, 70, 140], secondary: [50, 44, 80] };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

/** Porta una tinta in una fascia di luminosità/saturazione adatta a un bagliore su nero. */
function tame(rgb: [number, number, number]): [number, number, number] {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h, Math.min(Math.max(s, 0.35), 0.8), Math.min(Math.max(l, 0.3), 0.5));
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface Bucket {
  score: number;
  count: number;
  r: number;
  g: number;
  b: number;
  hue: number;
}

/**
 * Colori dominanti dai pixel RGB: i pixel quasi neri, quasi bianchi o grigi non
 * contano (sono sfondo e testo), gli altri finiscono in celle di tonalità/saturazione/
 * luminosità pesate per saturazione, così una macchia vivace piccola vince su un
 * grigio-blu esteso. La seconda tinta è la cella migliore ad almeno 40° di tonalità.
 */
export function dominantColors(pixels: Uint8Array | Buffer, channels: number): Palette {
  const buckets = new Map<string, Bucket>();
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.18 || l < 0.1 || l > 0.88) continue;
    const key = `${Math.floor(h / 24)}-${Math.floor(s * 4)}-${Math.floor(l * 4)}`;
    const bucket = buckets.get(key) ?? { score: 0, count: 0, r: 0, g: 0, b: 0, hue: 0 };
    bucket.score += 0.5 + s;
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.hue += h;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return FALLBACK;

  const toRgb = (k: Bucket): [number, number, number] => [
    Math.round(k.r / k.count),
    Math.round(k.g / k.count),
    Math.round(k.b / k.count),
  ];
  const first = ranked[0];
  const primary = tame(toRgb(first));
  const other = ranked.find(
    (k) => hueDistance(k.hue / k.count, first.hue / first.count) >= 40,
  );
  const secondary = other
    ? tame(toRgb(other))
    : (() => {
        const [h, s, l] = rgbToHsl(...primary);
        return hslToRgb((h + 30) % 360, s * 0.8, Math.max(0.22, l - 0.15));
      })();
  return { primary, secondary };
}

/**
 * Palette della locandina TMDB (versione `w92`, ~10 KB): dà a ogni scheda i propri
 * colori di sfondo. L'immagine passa dalla cache `fetch` di Next (30 giorni); il calcolo
 * su 40×60 pixel costa pochi millisecondi. Qualunque errore → tinta di ripiego, mai
 * un errore in pagina.
 */
export async function getPosterPalette(posterPath: string | null): Promise<Palette> {
  if (!posterPath) return FALLBACK;
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

/** `rgba()` CSS da una tinta della palette. */
export function rgba(color: [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}
