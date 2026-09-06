// Icone della nav mobile: dalle sorgenti del set del marchio (docs/design/brand/ui-icons/ICONE UI-*.png,
// glifo nero su trasparente, 2134px) a maschere da 96px in public/icons/nav/.
// Ogni icona viene centrata sul proprio bounding box e ritagliata in un riquadro
// **della stessa misura per tutte** (BOX): la scala del disegno non cambia da un'icona
// all'altra, quindi lo spessore del tratto resta uniforme nella barra.
// Uso: pnpm tsx scripts/generate-nav-icons.mjs   (oppure node)

import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SOURCES = {
  "ICONE UI-18.png": "home", // Z del marchio
  "ICONE UI-17.png": "search",
  "ICONE UI-12.png": "library",
  "ICONE UI-20.png": "cinema", // biglietto
  "ICONE UI-11.png": "friends",
  "ICONE UI-09.png": "profile",
};

const BOX = 1800; // riquadro comune sulla tela originale (2134px)
const OUT = 96; // maschera finale
const PAD = 1000; // margine per ritagliare anche fuori dalla tela

async function boundingBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

await mkdir("public/icons/nav", { recursive: true });

for (const [src, name] of Object.entries(SOURCES)) {
  const file = `docs/design/brand/ui-icons/${src}`;
  const { cx, cy } = await boundingBox(file);
  const padded = await sharp(file)
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp(padded)
    .extract({
      left: Math.round(cx - BOX / 2) + PAD,
      top: Math.round(cy - BOX / 2) + PAD,
      width: BOX,
      height: BOX,
    })
    .resize(OUT, OUT)
    .png({ compressionLevel: 9 })
    .toFile(`public/icons/nav/${name}.png`);
  console.log(`public/icons/nav/${name}.png`);
}
