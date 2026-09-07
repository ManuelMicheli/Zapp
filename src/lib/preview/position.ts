/**
 * Geometria della scheda di anteprima che si apre passando il mouse su una copertina
 * (solo desktop). Funzioni pure: il DOM e il fetch stanno in `PreviewLayer`/`PreviewCard`.
 */

import type { TrailerFrame } from "@/lib/trailers/frame-bars";

/** Riquadro in coordinate viewport (come `getBoundingClientRect`). */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Margine minimo fra la scheda e il bordo della finestra. */
export const PREVIEW_MARGIN = 12;

/**
 * Larghezza della scheda, per larghezza di finestra. Cresce con lo schermo: su un
 * portatile è già il doppio di una copertina, su un desktop grande diventa una vera
 * scheda da guardare (richiesta utente 2026-09-07). L'anteprima non esiste sotto i
 * 1024px, quindi il gradino più basso è quello del portatile piccolo.
 */
export function previewWidth(viewportWidth: number): number {
  if (viewportWidth >= 1920) return 660;
  if (viewportWidth >= 1600) return 600;
  if (viewportWidth >= 1360) return 540;
  return 480;
}

export interface PlacementInput {
  /** Copertina su cui è fermo il mouse. */
  anchor: Rect;
  /** Misure della scheda. */
  width: number;
  height: number;
  viewport: { width: number; height: number };
  margin?: number;
}

/**
 * Scheda centrata sulla copertina e riportata dentro la finestra: le prime e le ultime
 * copertine di uno scaffale, e le file in cima o in fondo alla pagina, non la fanno
 * uscire dallo schermo. Se la scheda è più grande della finestra vince il bordo iniziale
 * (`margin`), altrimenti il clamp la spingerebbe fuori dal lato opposto.
 */
export function previewPlacement({
  anchor,
  width,
  height,
  viewport,
  margin = PREVIEW_MARGIN,
}: PlacementInput): { left: number; top: number } {
  return {
    left: clamp(
      anchor.left + anchor.width / 2 - width / 2,
      margin,
      viewport.width - width - margin,
    ),
    top: clamp(
      anchor.top + anchor.height / 2 - height / 2,
      margin,
      viewport.height - height - margin,
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  // finestra più piccola della scheda: max < min, si tiene il bordo iniziale
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Player 16:9 (in px) e suo scostamento perché l'immagine reale copra il riquadro. */
export interface CoverBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Il player YouTube mostra sempre il frame 16:9 intero, bande nere comprese. Qui la
 * scheda è piccola e vuole un riquadro pieno: il player viene ingrandito e traslato
 * finché il **riquadro dell'immagine reale** (`frame`, senza bande) copre il riquadro
 * della scheda, centrato. È il "cover" della sola immagine, non del frame di YouTube:
 * nessuna banda nera entra nella scheda.
 *
 * (La scheda titolo fa l'opposto — "contain" del riquadro, `CinematicBackdrop` — perché
 * lì il trailer si deve vedere intero.)
 */
export function trailerCoverBox(
  frame: TrailerFrame,
  box: Rect | Omit<Rect, "left" | "top">,
): CoverBox {
  const w = frame.w > 0 ? frame.w : 1;
  const h = frame.h > 0 ? frame.h : 1;
  const x = frame.w > 0 ? frame.x : 0;
  const y = frame.h > 0 ? frame.y : 0;

  const width = Math.max(box.width / w, (box.height / h) * (16 / 9));
  const height = (width * 9) / 16;
  return {
    width,
    height,
    left: (box.width - w * width) / 2 - x * width,
    top: (box.height - h * height) / 2 - y * height,
  };
}
