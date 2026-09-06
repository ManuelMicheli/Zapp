// Genera gli avatar predefiniti di `src/lib/avatars.ts`:
// silhouette bianca su TRASPARENTE (sorgenti in docs/design/brand/avatars), 512px,
// scritte in public/avatars/<id>.png. Lo sfondo non è nel PNG: lo dipinge
// `Avatar`/`AvatarPicker` con il colore (pieno o sfumatura) scelto dall'utente,
// nero di default.
//   node scripts/generate-avatars.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "docs/design/brand/avatars");
const OUT = path.join(process.cwd(), "public/avatars");
const SIZE = 512;
const GLYPH = 384;

// [file sorgente, id]
const AVATARS = [
  ["icona profilo_Tavola disegno 1.png", "batman"],
  ["icona profilo-02.png", "joker"],
  ["icona profilo-03.png", "harley-quinn"],
  ["icona profilo-04.png", "superman"],
  ["icona profilo-05.png", "lanterna-verde"],
  ["icona profilo-06.png", "flash"],
  ["icona profilo-07.png", "principe"],
  ["icona profilo-08.png", "cyborg"],
  ["icona profilo-09.png", "wonder-woman"],
  ["icona profilo-10.png", "spider-man"],
  ["icona profilo-11.png", "iron-man"],
  ["icona profilo-12.png", "dracula"],
  ["icona profilo-13.png", "re"],
  ["icona profilo-14.png", "principessa"],
  ["icona profilo-15.png", "assassino"],
  ["icona profilo-16.png", "strega"],
  ["icona profilo-17.png", "frankenstein"],
  ["icona profilo-18.png", "classico"],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [file, id] of AVATARS) {
  // Solo l'alfa della sorgente conta: il glifo viene forzato a bianco puro, così
  // resta uguale su qualunque sfondo.
  const source = sharp(path.join(SRC, file)).ensureAlpha().trim({ threshold: 1 });
  const alpha = await source
    .clone()
    .extractChannel("alpha")
    .resize(GLYPH, GLYPH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const glyph = await sharp({
    create: { width: GLYPH, height: GLYPH, channels: 3, background: "#ffffff" },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  const offset = Math.round((SIZE - GLYPH) / 2);
  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: glyph, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${id}.png`));
}

console.log(`Generati ${AVATARS.length} avatar trasparenti in public/avatars`);
