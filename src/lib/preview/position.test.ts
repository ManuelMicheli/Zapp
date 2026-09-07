import { describe, expect, it } from "vitest";
import { previewPlacement, previewWidth, trailerCoverBox } from "./position";

const VIEWPORT = { width: 1440, height: 900 };
const CARD = { width: 380, height: 420 };

describe("previewPlacement", () => {
  it("centra la card sulla copertina quando c'è spazio", () => {
    const anchor = { left: 600, top: 300, width: 140, height: 210 };
    const p = previewPlacement({ anchor, ...CARD, viewport: VIEWPORT });
    expect(p.left).toBe(600 + 70 - 190);
    expect(p.top).toBe(300 + 105 - 210);
  });

  it("non esce dal bordo sinistro (prima copertina dello scaffale)", () => {
    const anchor = { left: 40, top: 300, width: 140, height: 210 };
    const p = previewPlacement({ anchor, ...CARD, viewport: VIEWPORT });
    expect(p.left).toBe(12);
  });

  it("non esce dal bordo destro (ultima copertina visibile)", () => {
    const anchor = { left: 1380, top: 300, width: 140, height: 210 };
    const p = previewPlacement({ anchor, ...CARD, viewport: VIEWPORT });
    expect(p.left).toBe(1440 - 380 - 12);
  });

  it("resta dentro sopra e sotto", () => {
    const alto = previewPlacement({
      anchor: { left: 600, top: 10, width: 140, height: 210 },
      ...CARD,
      viewport: VIEWPORT,
    });
    expect(alto.top).toBe(12);
    const basso = previewPlacement({
      anchor: { left: 600, top: 860, width: 140, height: 210 },
      ...CARD,
      viewport: VIEWPORT,
    });
    expect(basso.top).toBe(900 - 420 - 12);
  });

  it("card più alta del viewport: si appoggia in alto, non a valori negativi crescenti", () => {
    const p = previewPlacement({
      anchor: { left: 600, top: 300, width: 140, height: 210 },
      width: 380,
      height: 1000,
      viewport: VIEWPORT,
    });
    expect(p.top).toBe(12);
  });
});

describe("previewWidth", () => {
  it("cresce a gradini con la finestra", () => {
    expect(previewWidth(1024)).toBe(480);
    expect(previewWidth(1440)).toBe(540);
    expect(previewWidth(1600)).toBe(600);
    expect(previewWidth(1920)).toBe(660);
    expect(previewWidth(3840)).toBe(660);
  });

  it("sta sempre dentro la finestra, margini compresi", () => {
    for (const w of [1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
      expect(previewWidth(w)).toBeLessThan(w - 2 * 12);
    }
  });
});

describe("trailerCoverBox", () => {
  const box = { width: 380, height: 214 };

  it("frame intero in un riquadro 16:9: il player è il riquadro", () => {
    const c = trailerCoverBox({ x: 0, y: 0, w: 1, h: 1 }, box);
    expect(c.width).toBeCloseTo(380.4, 0);
    expect(c.left).toBeCloseTo(-0.2, 1);
    expect(c.top).toBeCloseTo(0, 1);
  });

  it("letterbox 2,39:1: il player cresce e l'immagine reale riempie il riquadro", () => {
    const frame = { x: 0, y: 0.125, w: 1, h: 0.75 };
    const c = trailerCoverBox(frame, box);
    // l'immagine reale copre esattamente il riquadro
    expect(c.width * frame.w).toBeGreaterThanOrEqual(box.width - 0.01);
    expect(((c.width * 9) / 16) * frame.h).toBeGreaterThanOrEqual(box.height - 0.01);
    // ed è centrata sul riquadro: l'eccedenza esce ugualmente dai due lati
    const imgLeft = c.left + frame.x * c.width;
    expect(imgLeft + (frame.w * c.width) / 2).toBeCloseTo(box.width / 2, 1);
    const imgTop = c.top + frame.y * ((c.width * 9) / 16);
    expect(imgTop + (frame.h * ((c.width * 9) / 16)) / 2).toBeCloseTo(box.height / 2, 1);
    expect(imgTop).toBeCloseTo(0, 1);
  });

  it("pillarbox: stessa proprietà di copertura", () => {
    const frame = { x: 0.2, y: 0, w: 0.6, h: 1 };
    const c = trailerCoverBox(frame, box);
    expect(c.width * frame.w).toBeGreaterThanOrEqual(box.width - 0.01);
    const imgLeft = c.left + frame.x * c.width;
    expect(imgLeft).toBeCloseTo(0, 1);
    expect(imgLeft + (frame.w * c.width) / 2).toBeCloseTo(box.width / 2, 1);
  });

  it("frame degenere: ripiego sul frame intero, mai divisione per zero", () => {
    const c = trailerCoverBox({ x: 0, y: 0, w: 0, h: 0 }, box);
    expect(Number.isFinite(c.width)).toBe(true);
    expect(c.width).toBeGreaterThan(0);
  });
});
