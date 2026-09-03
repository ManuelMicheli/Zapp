// Genera le icone PWA definitive da SVG (gradiente violet + fulmine).
// Uso: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

/**
 * @param {object} opts
 * @param {boolean} opts.rounded  angoli arrotondati (variante "any")
 * @param {number} opts.boltScale scala del fulmine (maskable: più piccolo, safe zone 80%)
 */
function iconSvg({ rounded, boltScale }) {
  const rx = rounded ? 112 : 0;
  const s = boltScale;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="0.55" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#4c1d95"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ede9fe"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2e1065" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <!-- bagliore dietro il fulmine -->
  <circle cx="256" cy="250" r="${170 * s}" fill="#a78bfa" opacity="0.35"/>
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)" filter="url(#shadow)">
    <path
      d="M292 44 L136 288 L232 288 L204 468 L376 208 L272 208 Z"
      fill="url(#bolt)"
      stroke="#4c1d95"
      stroke-width="6"
      stroke-linejoin="round"
    />
  </g>
</svg>`;
}

async function render(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(file);
  console.log("ok", file);
}

const anySvg = iconSvg({ rounded: true, boltScale: 1 });
const maskableSvg = iconSvg({ rounded: false, boltScale: 0.78 });

await render(anySvg, 192, `${OUT}/icon-192.png`);
await render(anySvg, 512, `${OUT}/icon-512.png`);
await render(maskableSvg, 192, `${OUT}/icon-maskable-192.png`);
await render(maskableSvg, 512, `${OUT}/icon-maskable-512.png`);
// iOS: quadrata piena, gli angoli li arrotonda il sistema
await render(iconSvg({ rounded: false, boltScale: 0.9 }), 180, `${OUT}/apple-touch-icon.png`);
console.log("fatto");
