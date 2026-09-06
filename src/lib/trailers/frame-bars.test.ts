import { describe, expect, it } from "vitest";
import { detectBars, frameAspect, frameFromBars, FULL_FRAME } from "./frame-bars";

const W = 320;
const H = 180;

/** Fotogramma grigio con bande nere di `top`/`bottom` righe e `left`/`right` colonne. */
function frame(
  bars: { top?: number; bottom?: number; left?: number; right?: number } = {},
  fill = 120,
): Uint8Array {
  const { top = 0, bottom = 0, left = 0, right = 0 } = bars;
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dark = y < top || y >= H - bottom || x < left || x >= W - right;
      g[y * W + x] = dark ? 4 : fill;
    }
  }
  return g;
}

describe("detectBars", () => {
  it("misura letterbox e pillarbox", () => {
    const b = detectBars(frame({ top: 22, bottom: 22, left: 40, right: 40 }), W, H);
    expect(b).toEqual({ top: 22 / H, bottom: 22 / H, left: 40 / W, right: 40 / W });
  });

  it("nessuna banda su un fotogramma pieno", () => {
    expect(detectBars(frame(), W, H)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("tollera il rumore JPEG nella banda", () => {
    const g = frame({ top: 22, bottom: 22 });
    // un paio di pixel chiari sparsi nella banda (< 2% della riga)
    g[3 * W + 10] = 90;
    g[3 * W + 200] = 60;
    expect(detectBars(g, W, H)?.top).toBe(22 / H);
  });

  it("una riga grigio scuro non è banda", () => {
    const g = frame({ top: 22, bottom: 22 });
    for (let x = 0; x < W; x++) g[10 * W + x] = 30;
    expect(detectBars(g, W, H)?.top).toBe(10 / H);
  });

  it("fotogramma tutto nero → null", () => {
    expect(detectBars(frame({}, 3), W, H)).toBeNull();
  });
});

describe("frameFromBars", () => {
  it("trailer 2,39:1: bande sopra e sotto tolte", () => {
    const bars = detectBars(frame({ top: 22, bottom: 22 }), W, H);
    const f = frameFromBars([bars, bars, bars]);
    expect(f).toEqual({ x: 0, y: 0.122, w: 1, h: 0.756 });
    expect(frameAspect(f)).toBeCloseTo(2.35, 1);
  });

  it("con due fotogrammi vale il minimo: una banda conta solo se è in entrambi", () => {
    const letterbox = detectBars(frame({ top: 22, bottom: 22 }), W, H);
    const full = detectBars(frame(), W, H);
    expect(frameFromBars([letterbox, full])).toEqual(FULL_FRAME);
  });

  it("con tre fotogrammi vale la mediana: uno anomalo non decide", () => {
    const letterbox = detectBars(frame({ top: 22, bottom: 22 }), W, H);
    const full = detectBars(frame(), W, H);
    const deeper = detectBars(frame({ top: 30, bottom: 30 }), W, H);
    expect(frameFromBars([letterbox, full, letterbox])).toEqual(
      frameFromBars([letterbox]),
    );
    expect(frameFromBars([deeper, letterbox, full])).toEqual(frameFromBars([letterbox]));
    expect(frameFromBars([full, full, letterbox])).toEqual(FULL_FRAME);
  });

  it("bande simmetriche: un lato scuro da solo non ritaglia", () => {
    const sky = detectBars(frame({ top: 40 }), W, H);
    expect(frameFromBars([sky])).toEqual(FULL_FRAME);
  });

  it("fotogrammi neri non contano, senza fotogrammi utili frame intero", () => {
    const bars = detectBars(frame({ top: 22, bottom: 22 }), W, H);
    expect(frameFromBars([null, bars])).toEqual(frameFromBars([bars]));
    expect(frameFromBars([null, null])).toEqual(FULL_FRAME);
    expect(frameFromBars([])).toEqual(FULL_FRAME);
  });

  it("bande sottili sono rumore", () => {
    const thin = detectBars(frame({ top: 2, bottom: 2, left: 3, right: 3 }), W, H);
    expect(frameFromBars([thin])).toEqual(FULL_FRAME);
  });

  it("immagine residua troppo piccola → frame intero", () => {
    const tiny = detectBars(frame({ top: 70, bottom: 70 }), W, H);
    expect(frameFromBars([tiny])).toEqual(FULL_FRAME);
  });

  it("pillarbox 4:3", () => {
    const bars = detectBars(frame({ left: 40, right: 40 }), W, H);
    const f = frameFromBars([bars]);
    expect(f).toEqual({ x: 0.125, y: 0, w: 0.75, h: 1 });
    expect(frameAspect(f)).toBeCloseTo(4 / 3, 2);
  });
});
