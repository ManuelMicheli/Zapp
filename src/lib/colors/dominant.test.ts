import { describe, expect, it } from "vitest";
import { dominantColor, dominantColors, rgbToHsl } from "./dominant";

/** Immagine finta: ogni voce è `[r, g, b, quante volte]`. */
function pixels(...parts: [number, number, number, number][]): Uint8Array {
  const out: number[] = [];
  for (const [r, g, b, n] of parts) {
    for (let i = 0; i < n; i += 1) out.push(r, g, b);
  }
  return new Uint8Array(out);
}

const hue = (c: [number, number, number]) => rgbToHsl(...c)[0];
/** Distanza di tonalità dal rosso (che sta a cavallo di 0°/360°). */
const fromRed = (c: [number, number, number]) => Math.min(hue(c), 360 - hue(c));
const sat = (c: [number, number, number]) => rgbToHsl(...c)[1];
const lig = (c: [number, number, number]) => rgbToHsl(...c)[2];

describe("dominantColors", () => {
  it("una locandina in bianco e nero resta in bianco e nero", () => {
    // grigi puri più il rumore di compressione (pixel appena colorati)
    const p = dominantColors(
      pixels(
        [20, 20, 20, 400],
        [130, 130, 130, 300],
        [225, 225, 225, 200],
        [134, 128, 130, 20],
      ),
      3,
    );
    expect(p.neutral).toBe(true);
    expect(sat(p.primary)).toBeLessThan(0.12);
    expect(sat(p.secondary)).toBeLessThan(0.12);
    expect(lig(p.primary)).toBeGreaterThan(lig(p.secondary));
  });

  it("il grigio freddo di un bianco e nero blu resta freddo", () => {
    const p = dominantColors(pixels([12, 14, 18, 300], [150, 158, 172, 500]), 3);
    expect(p.neutral).toBe(true);
    expect(hue(p.primary)).toBeGreaterThan(180);
    expect(hue(p.primary)).toBeLessThan(260);
    expect(sat(p.primary)).toBeLessThan(0.12);
  });

  it("il dettaglio rosso di un bianco e nero arriva in pagina, ma non la riempie", () => {
    // il cappotto rosso di Schindler's List: pochi pixel in un mare di grigi
    const p = dominantColors(
      pixels([25, 25, 25, 500], [140, 138, 136, 600], [210, 30, 30, 40]),
      3,
    );
    expect(p.neutral).toBe(true);
    expect(sat(p.primary)).toBeLessThan(0.12);
    expect(fromRed(p.secondary)).toBeLessThan(20);
    expect(p.secondaryWeight).toBeLessThan(0.75);
  });

  it("una locandina più grigia che rossa dà più grigio che rosso", () => {
    // Sin City: ardesia dappertutto, il titolo in rosso
    const p = dominantColors(
      pixels([10, 10, 12, 600], [58, 66, 72, 700], [235, 30, 36, 90]),
      3,
    );
    expect(p.neutral).toBe(true);
    expect(fromRed(p.secondary)).toBeLessThan(20);
    expect(p.secondaryWeight).toBeLessThan(0.8);
  });

  it("un colore che occupa la locandina vince sul grigio", () => {
    const p = dominantColors(pixels([120, 120, 122, 200], [30, 120, 220, 800]), 3);
    expect(p.neutral).toBe(false);
    expect(hue(p.primary)).toBeGreaterThan(180);
    expect(hue(p.primary)).toBeLessThan(260);
  });

  it("nero e rosso danno rosso e rosso scuro, mai una seconda tinta inventata", () => {
    const p = dominantColors(
      // sfondo nero (invisibile), rosso pieno, e un dettaglio ciano da tre pixel
      pixels([8, 8, 8, 600], [190, 28, 28, 400], [30, 200, 210, 3]),
      3,
    );
    expect(p.neutral).toBe(false);
    expect(fromRed(p.primary)).toBeLessThan(20);
    // la seconda tinta è una variante della prima, non il ciano
    expect(fromRed(p.secondary)).toBeLessThan(60);
    expect(lig(p.secondary)).toBeLessThan(lig(p.primary));
  });

  it("due colori veri restano due colori", () => {
    const p = dominantColors(pixels([40, 80, 200, 400], [220, 140, 40, 380]), 3);
    expect(p.neutral).toBe(false);
    const d = Math.abs(hue(p.primary) - hue(p.secondary));
    expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(40);
  });

  it("il rosso di un titolo, sparso su più sfumature, batte l'altro colore", () => {
    const p = dominantColors(
      pixels(
        [6, 6, 8, 900],
        [40, 110, 130, 220],
        [240, 31, 39, 90],
        [190, 30, 36, 90],
        [155, 28, 34, 90],
      ),
      3,
    );
    expect(fromRed(p.primary)).toBeLessThan(20);
  });

  it("l'incarnato di un volto non colora la pagina di beige", () => {
    const p = dominantColors(pixels([196, 142, 113, 600], [30, 90, 180, 300]), 3);
    expect(hue(p.primary)).toBeGreaterThan(180);
    expect(hue(p.primary)).toBeLessThan(260);
  });

  it("una locandina quasi tutta nera tinge meno di una piena", () => {
    const buia = dominantColors(pixels([4, 4, 4, 900], [200, 40, 40, 100]), 3);
    const piena = dominantColors(pixels([200, 40, 40, 1000]), 3);
    expect(buia.intensity).toBeLessThan(piena.intensity);
    expect(buia.intensity).toBeGreaterThanOrEqual(0.5);
    expect(piena.intensity).toBeLessThanOrEqual(1);
  });
});

describe("dominantColor", () => {
  it("nessuna tinta su un logo in bianco e nero", () => {
    expect(dominantColor(pixels([255, 255, 255, 500], [10, 10, 10, 500]), 3)).toBeNull();
  });

  it("la tinta di un riquadro pieno", () => {
    const c = dominantColor(pixels([229, 9, 20, 900]), 3);
    expect(c).not.toBeNull();
    expect(fromRed(c!)).toBeLessThan(15);
  });
});
