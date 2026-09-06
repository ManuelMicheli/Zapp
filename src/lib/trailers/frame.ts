import "server-only";

// STUB temporaneo: nel merge con feat/cinema-vicino va preso il frame.ts di quel branch
// (miniature YouTube + sharp per misurare le bande nere). Qui serve solo a tipizzare.

/** Riquadro dell'immagine reale, in frazioni del frame 16:9 (0–1). */
export interface TrailerFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Un trailer candidato per il fondale: chiave YouTube e riquadro dell'immagine reale. */
export interface Trailer {
  key: string;
  frame: TrailerFrame;
}

export const FULL_FRAME: TrailerFrame = { x: 0, y: 0, w: 1, h: 1 };

/** Chiavi → trailer con riquadro, nello stesso ordine. */
export async function withFrames(keys: string[]): Promise<Trailer[]> {
  return keys.map((key) => ({ key, frame: FULL_FRAME }));
}
