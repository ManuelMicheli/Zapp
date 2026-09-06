/**
 * Bande nere di un video YouTube (letterbox sopra/sotto, pillarbox ai lati), lette dalle
 * miniature. Funzioni pure: il download e `sharp` stanno in `frame.ts`.
 *
 * Il player mostra sempre il frame 16:9 intero; se il trailer è 2,39:1 (quasi tutti i
 * film) un quarto del frame è nero. Conoscendo il riquadro reale dell'immagine il
 * fondale può mostrarla intera **senza** le bande, e la banda della scheda prende la
 * forma del trailer: niente nero in pagina e ogni pixel del riquadro è immagine.
 */

/** Riquadro dell'immagine reale, in frazioni del frame 16:9 (0–1). */
export interface TrailerFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Spessore delle bande nere di un fotogramma, in frazioni di larghezza/altezza. */
export interface Bars {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const FULL_FRAME: TrailerFrame = { x: 0, y: 0, w: 1, h: 1 };

/** Un trailer candidato per il fondale: chiave YouTube e riquadro dell'immagine reale. */
export interface Trailer {
  key: string;
  frame: TrailerFrame;
}

/** Sopra questa luminanza (0–255) un pixel non è "nero" di banda. */
const DARK_MAX = 40;
/** Luminanza media massima di una riga/colonna di banda. */
const ROW_MEAN_MAX = 12;
/** Quota massima di pixel non neri tollerata in una riga di banda (rumore JPEG). */
const ROW_BRIGHT_MAX = 0.02;
/** Bande più sottili di così sono rumore di codifica ai bordi: si ignorano. */
const MIN_BAR = 0.015;
/**
 * Se l'immagine residua è più piccola di così il rilevamento non è affidabile
 * (miniature buie, dissolvenze): si tiene il frame intero.
 */
const MIN_CONTENT = 0.3;

/** Vero se la riga/colonna di `values` è nera di banda. */
function isBar(values: ArrayLike<number>): boolean {
  let sum = 0;
  let bright = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (values[i] > DARK_MAX) bright++;
  }
  return sum / values.length <= ROW_MEAN_MAX && bright / values.length <= ROW_BRIGHT_MAX;
}

/**
 * Bande nere di un fotogramma in scala di grigi (`gray` = `width × height` byte, una
 * riga dopo l'altra). Null se il fotogramma è nero quasi tutto (inutile per il calcolo).
 */
export function detectBars(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): Bars | null {
  if (width <= 0 || height <= 0 || gray.length < width * height) return null;
  const row = (y: number): ArrayLike<number> =>
    Array.prototype.slice.call(gray, y * width, (y + 1) * width);
  const col = (x: number): number[] => {
    const out = new Array<number>(height);
    for (let y = 0; y < height; y++) out[y] = gray[y * width + x];
    return out;
  };

  let top = 0;
  while (top < height && isBar(row(top))) top++;
  if (top === height) return null;
  let bottom = 0;
  while (bottom < height - top && isBar(row(height - 1 - bottom))) bottom++;
  let left = 0;
  while (left < width && isBar(col(left))) left++;
  if (left === width) return null;
  let right = 0;
  while (right < width - left && isBar(col(width - 1 - right))) right++;

  return {
    top: top / height,
    bottom: bottom / height,
    left: left / width,
    right: right / width,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Mediana con ≥ 3 valori (un fotogramma anomalo non conta), altrimenti il minimo. */
function robust(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : sorted[0];
}

/**
 * Riquadro dell'immagine da più fotogrammi: per ogni asse la banda è simmetrica (il
 * minimo dei due lati: un cielo notturno in alto non è una banda) e fra i fotogrammi
 * vale la mediana (con tre fotogrammi uno buio o con un titolo fino al bordo non
 * decide; con meno vale il minimo, che non ritaglia mai immagine vera). Sotto `MIN_BAR`
 * è rumore.
 */
export function frameFromBars(frames: (Bars | null)[]): TrailerFrame {
  const valid = frames.filter((b): b is Bars => b !== null);
  if (valid.length === 0) return FULL_FRAME;
  let v = robust(valid.map((b) => Math.min(b.top, b.bottom)));
  let h = robust(valid.map((b) => Math.min(b.left, b.right)));
  if (v < MIN_BAR) v = 0;
  if (h < MIN_BAR) h = 0;
  const frame = { x: round(h), y: round(v), w: round(1 - 2 * h), h: round(1 - 2 * v) };
  if (frame.w < MIN_CONTENT || frame.h < MIN_CONTENT) return FULL_FRAME;
  return frame;
}

/** Rapporto larghezza/altezza dell'immagine reale (il frame YouTube è 16:9). */
export function frameAspect(frame: TrailerFrame): number {
  return ((16 / 9) * frame.w) / frame.h;
}
