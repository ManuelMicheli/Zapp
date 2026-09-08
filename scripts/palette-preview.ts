/* Anteprima: locandina + sfumatura calcolata, per controllare a occhio la coerenza. */
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { chromium } from "playwright";
import { dominantColors, glow } from "../src/lib/colors/dominant";

const TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN!;
const OUT = process.argv[2] ?? "palette-preview.png";
const IDS: [string, number, string][] = [
  ["movie", 424, "Schindler's List"],
  ["movie", 503919, "The Lighthouse"],
  ["movie", 1578, "Toro scatenato"],
  ["movie", 74643, "The Artist"],
  ["movie", 187, "Sin City"],
  ["movie", 426426, "Roma"],
  ["movie", 346698, "Barbie"],
  ["movie", 335984, "Blade Runner 2049"],
  ["tv", 66732, "Stranger Things"],
  ["tv", 94605, "Arcane"],
  ["movie", 680, "Pulp Fiction"],
  ["movie", 872585, "Oppenheimer"],
];

const hexOf = (c: number[]) =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

async function main() {
  const cards: string[] = [];
  for (const [type, id, label] of IDS) {
    const json = await (
      await fetch(`https://api.themoviedb.org/3/${type}/${id}?language=it-IT`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
    ).json();
    const bytes = Buffer.from(
      await (
        await fetch(`https://image.tmdb.org/t/p/w185${json.poster_path}`)
      ).arrayBuffer(),
    );
    const { data, info } = await sharp(bytes)
      .resize({ width: 40 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { primary, secondary, secondaryWeight, intensity, neutral } = dominantColors(
      data,
      info.channels,
    );
    const a = (x: number) => glow(primary, x * intensity);
    const b = (x: number) => glow(secondary, x * intensity * secondaryWeight);
    const bg = [
      `radial-gradient(70% 60% at 8% 100%, ${a(0.6)} 0%, ${a(0)} 100%)`,
      `radial-gradient(60% 55% at 100% 55%, ${b(0.5)} 0%, ${b(0)} 100%)`,
      `radial-gradient(95% 45% at 22% 30%, ${a(0.58)} 0%, ${a(0)} 100%)`,
      `radial-gradient(70% 40% at 88% 80%, ${b(0.45)} 0%, ${b(0)} 100%)`,
    ].join(", ");
    console.log(
      label.padEnd(22),
      neutral ? "NEUTRO" : "colore",
      hexOf(primary),
      hexOf(secondary),
      `peso ${secondaryWeight.toFixed(2)}`,
      `forza ${intensity.toFixed(2)}`,
    );
    cards.push(
      `<div class="card"><div class="amb" style="background:${bg}"></div>` +
        `<img src="data:image/jpeg;base64,${bytes.toString("base64")}">` +
        `<div class="cap">${label}${neutral ? " · NEUTRO" : ""}</div></div>`,
    );
  }

  const html = `<style>
  body{margin:0;background:#000;color:#fff;font:13px system-ui;display:grid;
       grid-template-columns:repeat(4,1fr);gap:2px}
  .card{position:relative;height:300px;display:flex;align-items:center;justify-content:center;
        background:#000;overflow:hidden}
  .amb{position:absolute;inset:0}
  img{position:relative;height:200px;border-radius:8px;box-shadow:0 10px 30px #000a}
  .cap{position:absolute;bottom:8px;left:10px;opacity:.85}
  </style>${cards.join("")}`;

  const file = `${process.cwd()}/.palette-preview.html`;
  await writeFile(file, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`file://${file}`);
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  console.log(OUT);
}
main();
