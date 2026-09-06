import "server-only";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import {
  detectBars,
  frameFromBars,
  FULL_FRAME,
  type Bars,
  type Trailer,
  type TrailerFrame,
} from "./frame-bars";

export type { Trailer, TrailerFrame } from "./frame-bars";

/**
 * Fotogrammi 16:9 (320×180, ~5 KB) al 25/50/75% di ogni video YouTube: bastano per
 * misurare le bande a ~0,5% di precisione. Non `mqdefault`: spesso è una copertina
 * caricata a mano, a pieno frame, con bande diverse dal video.
 */
const THUMBS = ["mq1", "mq2", "mq3"];
const THUMB_TIMEOUT_MS = 3000;
/** Le bande di un video non cambiano: cache dati Next lunga. */
const REVALIDATE_S = 30 * 24 * 60 * 60;

async function readBars(key: string, name: string): Promise<Bars | null> {
  const res = await fetch(`https://i.ytimg.com/vi/${key}/${name}.jpg`, {
    signal: AbortSignal.timeout(THUMB_TIMEOUT_MS),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) return null;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectBars(data, info.width, info.height);
}

async function computeTrailerFrame(key: string): Promise<TrailerFrame> {
  try {
    const bars = await Promise.all(
      THUMBS.map((name) => readBars(key, name).catch(() => null)),
    );
    return frameFromBars(bars);
  } catch (error) {
    console.warn(`[trailers] bande di ${key}:`, error);
    return FULL_FRAME;
  }
}

/** Riquadro in cache 30 giorni (chiave = id video): `sharp` gira una volta per trailer. */
const cachedTrailerFrame = unstable_cache(computeTrailerFrame, ["trailer-frame"], {
  revalidate: REVALIDATE_S,
});

/**
 * Riquadro dell'immagine reale di un video YouTube (bande nere escluse), in frazioni del
 * frame 16:9. Qualunque errore → frame intero, mai un errore in pagina.
 */
export async function getTrailerFrame(key: string): Promise<TrailerFrame> {
  try {
    return await cachedTrailerFrame(key);
  } catch {
    return FULL_FRAME;
  }
}

/** Chiavi → trailer con riquadro, nello stesso ordine. */
export async function withFrames(keys: string[]): Promise<Trailer[]> {
  const frames = await Promise.all(keys.map(getTrailerFrame));
  return keys.map((key, i) => ({ key, frame: frames[i] }));
}
