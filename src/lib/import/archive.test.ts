import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_UNZIPPED_BYTES, nuovoBudget, unzipSources } from "./archive";

/** I campi dello zip sono interi little-endian. */
function u32(buf: Uint8Array, off: number): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(off, true);
}
function setU32(buf: Uint8Array, off: number, value: number): void {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint32(off, value, true);
}
function setU16(buf: Uint8Array, off: number, value: number): void {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint16(off, value, true);
}

/** Inizio del record di chiusura della central directory. */
function eocd(zip: Uint8Array): number {
  for (let i = zip.length - 22; i >= 0; i--) if (u32(zip, i) === 0x06054b50) return i;
  throw new Error("EOCD non trovato");
}

/**
 * Zip artigianale: un solo payload STORED, ma la central directory lo nomina
 * `copie` volte con `originalSize` dichiarato a zero. fflate materializza una
 * copia per record (`slc(data, b, b + compressedSize)`), mentre nel risultato ne
 * resta una sola perché il nome è lo stesso: né contare il dichiarato né contare
 * dopo proteggono da questo.
 */
function zipConVociRipetute(payload: Uint8Array, copie: number): Uint8Array {
  const base = zipSync({ "a.csv": payload }, { level: 0 });
  const e = eocd(base);
  const cdOff = u32(base, e + 16);
  const cdSize = u32(base, e + 12);
  const record = base.slice(cdOff, cdOff + cdSize);
  setU32(record, 24, 0); // dimensione originale dichiarata: zero
  const out = new Uint8Array(cdOff + cdSize * copie + 22);
  out.set(base.subarray(0, cdOff), 0);
  for (let i = 0; i < copie; i++) out.set(record, cdOff + cdSize * i);
  const eo = cdOff + cdSize * copie;
  setU32(out, eo, 0x06054b50);
  setU16(out, eo + 8, copie);
  setU16(out, eo + 10, copie);
  setU32(out, eo + 12, cdSize * copie);
  setU32(out, eo + 16, cdOff);
  return out;
}

describe("unzipSources", () => {
  it("estrae solo csv e json, scartando il resto", () => {
    const zip = zipSync({
      "letterboxd/watched.csv": strToU8("Name,Year\nDune,2021\n"),
      "letterboxd/profile.jpg": strToU8("non un csv"),
      "letterboxd/ratings.csv": strToU8("Name,Rating\nDune,4\n"),
    });
    const files = unzipSources(zip);
    expect(files.map((f) => f.name).sort()).toEqual(["ratings.csv", "watched.csv"]);
    expect(files.find((f) => f.name === "watched.csv")?.text).toContain("Dune");
  });

  it("si ferma quando il decompresso supera il tetto", () => {
    const zip = zipSync({ "grande.csv": strToU8("0".repeat(12 * 1024 * 1024)) });
    expect(() => unzipSources(zip)).toThrow(/troppo grande/i);
    expect(zip.length).toBeLessThan(100_000);
  });

  it("una voce STORED conta per quello che verrà materializzato", () => {
    // level 0 = nessuna compressione: fflate taglia `compressedSize` byte dal
    // file, quindi il tetto deve guardare anche quello, non solo il dichiarato.
    const zip = zipSync(
      { "grande.csv": strToU8("0".repeat(11 * 1024 * 1024)) },
      { level: 0 },
    );
    expect(() => unzipSources(zip)).toThrow(/troppo grande/i);
  });

  it("una central directory che dichiara zero non aggira il tetto", () => {
    // dodici record da 1MB l'uno: 12MB materializzati, un solo file nel
    // risultato. Contando il dichiarato (zero) o la somma finale (1MB) passava.
    const zip = zipConVociRipetute(strToU8("0".repeat(1024 * 1024)), 12);
    expect(() => unzipSources(zip)).toThrow(/troppo grande/i);
  });

  it("il budget è della richiesta: due archivi non hanno 10MB a testa", () => {
    const meta = strToU8("0".repeat(6 * 1024 * 1024));
    const uno = zipSync({ "uno.csv": meta });
    const due = zipSync({ "due.csv": meta });
    const budget = nuovoBudget();
    expect(unzipSources(uno, budget)).toHaveLength(1);
    expect(budget.rimanente).toBeLessThan(MAX_UNZIPPED_BYTES);
    expect(() => unzipSources(due, budget)).toThrow(/troppo grande/i);
  });
});
