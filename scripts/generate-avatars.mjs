// Genera gli avatar predefiniti di `src/lib/avatars.ts`:
// silhouette bianca (sorgenti in docs/design/brand/avatars) su sfumatura a tema,
// 512px, scritti in public/avatars/<id>.png. Lo sfondo è dentro il PNG così ogni
// <Image> che mostra un avatar funziona senza casi speciali.
//   node scripts/generate-avatars.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "docs/design/brand/avatars");
const OUT = path.join(process.cwd(), "public/avatars");
const SIZE = 512;
const GLYPH = 384;

// [file sorgente, id, colore alto-sinistra, colore basso-destra]
const AVATARS = [
  ["icona profilo_Tavola disegno 1.png", "batman", "#3b4252", "#0b0d12"],
  ["icona profilo-02.png", "joker", "#7c3aed", "#2f9e44"],
  ["icona profilo-03.png", "harley-quinn", "#e11d48", "#1d4ed8"],
  ["icona profilo-04.png", "superman", "#1d4ed8", "#b91c1c"],
  ["icona profilo-05.png", "lanterna-verde", "#16a34a", "#064e3b"],
  ["icona profilo-06.png", "flash", "#ef4444", "#b45309"],
  ["icona profilo-07.png", "principe", "#f59e0b", "#7c3aed"],
  ["icona profilo-08.png", "cyborg", "#0ea5e9", "#334155"],
  ["icona profilo-09.png", "wonder-woman", "#dc2626", "#1d4ed8"],
  ["icona profilo-10.png", "spider-man", "#dc2626", "#1e3a8a"],
  ["icona profilo-11.png", "iron-man", "#b91c1c", "#f59e0b"],
  ["icona profilo-12.png", "dracula", "#5b21b6", "#111827"],
  ["icona profilo-13.png", "re", "#f59e0b", "#92400e"],
  ["icona profilo-14.png", "principessa", "#ec4899", "#a855f7"],
  ["icona profilo-15.png", "assassino", "#64748b", "#0f172a"],
  ["icona profilo-16.png", "strega", "#8b5cf6", "#1e1b4b"],
  ["icona profilo-17.png", "frankenstein", "#65a30d", "#14532d"],
  ["icona profilo-18.png", "classico", "#a78bfa", "#7c3aed"],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [file, id, from, to] of AVATARS) {
  const bg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/></svg>`,
  );
  const glyph = await sharp(path.join(SRC, file))
    .trim({ threshold: 1 })
    .resize(GLYPH, GLYPH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((SIZE - GLYPH) / 2);
  await sharp(bg)
    .composite([{ input: glyph, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${id}.png`));
}

console.log(`Generati ${AVATARS.length} avatar in public/avatars`);
