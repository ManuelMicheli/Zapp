/**
 * Rigenera i marchi delle catene in `public/cinema/` dagli asset pubblici dei
 * rispettivi siti (uso nominativo: servono a riconoscere la sala).
 * La CSP consente solo `self`, quindi i loghi vanno serviti dal nostro dominio:
 * mai un `<img>` che punta al sito della catena.
 *
 *   node scripts/fetch-chain-logos.mjs
 *
 * Marchi quadrati → 96×96 trasparente (tessera); marchi in sola scritta → alti 44
 * (pillola). Per The Space l'icona ha il fondo nero: viene reso trasparente, così
 * la tessera in vetro non mostra un buco nero.
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = new URL("../public/cinema/", import.meta.url);

/** `ico` = file .ico con dentro un PNG (si taglia dalla firma PNG in poi). */
const SOURCES = [
  {
    file: "uci.png",
    url: "https://ucicinemas.it/favicon.ico",
    ico: true,
    shape: "square",
  },
  {
    file: "the-space.png",
    url: "https://www.thespacecinema.it/favicons/it/favicon-196x196.png",
    shape: "square",
    dropBlack: true,
  },
  {
    file: "notorious.png",
    url: "https://www.notoriouscinemas.it/generic/images/logo_footer.png",
    shape: "wide",
  },
  {
    file: "cinelandia.png",
    url: "https://www.cinelandia.it/wp-content/uploads/2025/11/cropped-cropped-fav_icon-250x250.png",
    shape: "square",
  },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Fondo nero → trasparente, con i pixel di bordo sfumati invece che seghettati. */
async function dropBlackBackground(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum < 42) data[i + 3] = 0;
    else if (lum < 70) data[i + 3] = Math.round(data[i + 3] * ((lum - 42) / 28));
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

await mkdir(OUT, { recursive: true });

for (const source of SOURCES) {
  const response = await fetch(source.url);
  if (!response.ok) {
    console.error(`[chain-logos] ${source.file}: HTTP ${response.status}`);
    continue;
  }
  let buffer = Buffer.from(await response.arrayBuffer());
  if (source.ico) {
    const at = buffer.indexOf(PNG_SIGNATURE);
    if (at < 0) {
      console.error(`[chain-logos] ${source.file}: nessun PNG dentro l'ico`);
      continue;
    }
    buffer = buffer.subarray(at);
  }
  if (source.dropBlack) buffer = await dropBlackBackground(buffer);

  const pipeline =
    source.shape === "square"
      ? sharp(buffer).resize(96, 96, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
      : sharp(buffer).resize({ height: 44 });

  const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(source.file, OUT), out);
  const { width, height } = await sharp(out).metadata();
  console.log(`[chain-logos] ${source.file} ${width}×${height} ${out.length} B`);
}
