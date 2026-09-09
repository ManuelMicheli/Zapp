/**
 * Il muro di locandine delle email di autenticazione, come GIF.
 *
 * Nelle email non esistono ne' animazioni CSS ne' JavaScript: l'unico modo di far
 * scorrere le locandine come sul login e' una GIF. Questo script rende in Chrome la
 * stessa geometria di `PosterWall` (prospettiva, colonne che traslano di un set),
 * fotogramma per fotogramma, e la impacchetta con ffmpeg.
 *
 *   node --env-file=.env.local scripts/email-wall.mjs
 *
 * Esce `public/email/wall.gif` (+ `wall.jpg`, primo fotogramma: lo mostrano i client
 * che le GIF non le animano, per esempio Outlook classico). Va rilanciato solo quando
 * si vogliono locandine nuove: il file e' versionato, l'email non chiama TMDB.
 *
 * Serve ffmpeg nel PATH e TMDB_API_READ_ACCESS_TOKEN.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "email");

/**
 * Misure finali della GIF. Escono 480x240 per una colonna larga 600: una GIF pesa
 * quanto i pixel che cambiano per il numero di fotogrammi, e qui cambia tutta
 * l'immagine a ogni fotogramma. Il muro e' scuro, sfocato dalla scala e coperto dai
 * veli: l'ingrandimento del client non si nota, mezzo mega in meno si'.
 */
const OUT_W = 480;
const OUT_H = 240;
/**
 * Il muro si rende grande e poi si rimpicciolisce: a 600px di layout ci starebbero
 * cinque locandine giganti, mentre quello dell'app e' fatto di molte locandine
 * piccole. Si fotografa 960x480 a 1,5x (cioe' 1440x720) e si scala a 600x300: la
 * scena ha le stesse proporzioni e le locandine restano nitide.
 */
const RENDER_W = 960;
const RENDER_H = 480;
const SCALE = 1.5;
/** Fotogrammi di un giro completo e durata di ciascuno (centesimi di secondo). */
const FRAMES = 18;
const DELAY_CS = 16;

/** Geometria del muro: gli stessi numeri di src/components/marketing/PosterWall.tsx. */
const POSTER_W = 112;
const POSTER_H = 168;
const GAP = 12;
const ITEM = POSTER_H + GAP;
const PER_COL = 4;
const SET = ITEM * PER_COL;
const PERSPECTIVE = 1000;
const TILT_DEG = 8;
const PITCH_DEG = 24;
const COLUMNS = 9;
const OFFSETS = [0, -120, -60, -160, -20, -100, -80, -140, -40];

const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
if (!token || token.startsWith("INSERISCI")) {
  console.error("Manca TMDB_API_READ_ACCESS_TOKEN: lancia con --env-file=.env.local");
  process.exit(1);
}

/** Le stesse fonti del muro dell'app: tendenze della settimana e film nelle sale IT. */
async function posters() {
  const get = async (path) => {
    const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`TMDB ${res.status} su ${path}`);
    return (await res.json()).results ?? [];
  };
  const [trending, cinema, tv] = await Promise.all([
    get("trending/all/week?language=it-IT&page=1"),
    get("movie/now_playing?language=it-IT&region=IT&page=1"),
    get("tv/on_the_air?language=it-IT&page=1"),
  ]);
  const seen = new Set();
  const out = [];
  // a rotazione fra le fonti, come getWallPosters: il muro non e' tutto un genere
  for (let i = 0; i < 30; i++) {
    for (const list of [trending, cinema, tv]) {
      const p = list[i]?.poster_path;
      if (p && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out.slice(0, COLUMNS * PER_COL);
}

/**
 * Quanto e' alto il muro in coordinate di layout. Come in `wallGeometry`: la rotazione
 * porta il fondo verso la camera, quindi bastano meno px di quelli del riquadro.
 */
function geometry(height) {
  const sinTilt = Math.sin((TILT_DEG * Math.PI) / 180);
  const cosTilt = Math.cos((TILT_DEG * Math.PI) / 180);
  const sinPitch = Math.sin((PITCH_DEG * Math.PI) / 180);
  const cosPitch = Math.cos((PITCH_DEG * Math.PI) / 180);
  const wrapperWidth = COLUMNS * POSTER_W + (COLUMNS - 1) * GAP;
  const tilt = (wrapperWidth / 2) * sinTilt;
  const lift = 40 + tilt;
  const depth = height / (cosPitch + (height * sinPitch) / PERSPECTIVE);
  const reach = lift + (depth + tilt) / cosTilt;
  const items = Math.max(2 * PER_COL, Math.ceil((reach + ITEM + SET) / ITEM));
  return { lift, items };
}

/**
 * La pagina da fotografare. Nessuna animazione: la posizione di ogni colonna la
 * decide `window.__frame(t)`, cosi' il giro si chiude esatto (a t=1 ogni colonna ha
 * traslato di un set intero, cioe' e' identica a t=0).
 */
function page(list) {
  const fontUrl = pathToFileURL(join(ROOT, "public", "fonts", "inter-var.woff2")).href;
  const H = RENDER_H;
  const W = RENDER_W;
  const { lift, items } = geometry(H);
  const cols = Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: PER_COL }, (_, j) => list[(c * PER_COL + j) % list.length]),
  );
  const column = (col, c) => {
    const tiles = Array.from({ length: items }, (_, i) => col[i % PER_COL])
      .map(
        (path) =>
          `<img src="https://image.tmdb.org/t/p/w342${path}" width="${POSTER_W}" height="${POSTER_H}" />`,
      )
      .join("");
    return `<div class="col" data-dir="${c % 2 ? 1 : -1}" style="margin-top:${OFFSETS[c % OFFSETS.length]}px">${tiles}</div>`;
  };
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      /* Il carattere dell'app, dal repo: la GIF e' un'immagine, nessuno la scarica. */
      @font-face { font-family: Inter; src: url("${fontUrl}") format("woff2"); font-weight: 100 900; }
      html, body { margin: 0; background: #000; }
      .frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      .scene { position: absolute; left: -70px; top: -120px; width: ${W + 140}px; height: ${H + 240}px;
               perspective: ${PERSPECTIVE}px; }
      .wall { display: flex; gap: ${GAP}px;
              transform: rotateX(${PITCH_DEG}deg) rotateZ(-${TILT_DEG}deg) translateY(-${Math.round(lift)}px);
              transform-origin: 50% 0%; }
      .col { display: flex; flex-direction: column; gap: ${GAP}px; }
      .col img { display: block; width: ${POSTER_W}px; height: ${POSTER_H}px; object-fit: cover; border-radius: 8px; }
      /* Gli stessi veli dell'app: il muro deve restare sotto al testo, non accanto. */
      /* Gli stessi veli di AuthShell: il muro si vede, ma il marchio sopra si legge. */
      .veil { position: absolute; inset: 0; }
      .veil.shade { background: linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.30) 24%, rgba(0,0,0,.52) 58%, rgba(5,5,6,.88) 88%, #050506 100%); }
      /* Il fondo sfuma nel nero della mail: sotto la testata non c'e' nessuna card. */
      /* Sotto al marchio il muro va spento, altrimenti una locandina chiara si mangia il testo. */
      .veil.focus { background: radial-gradient(46% 42% at 50% 50%, rgba(0,0,0,.55) 0%, rgba(0,0,0,.28) 55%, transparent 78%); }
      .veil.glow { background: radial-gradient(58% 70% at 20% 24%, rgba(139,92,246,.34) 0%, rgba(139,92,246,.10) 46%, transparent 72%); }
      .brand { position: absolute; inset: 0; display: flex; flex-direction: column;
               align-items: center; justify-content: center; gap: 14px; text-align: center; }
      .brand .name { font-family: Inter, sans-serif; font-weight: 700; font-size: 76px;
                     line-height: 1; letter-spacing: -0.055em; color: #f5f5f7; }
      .brand .name span { color: #c5baf4; }
      .brand .claim { font-family: Inter, sans-serif; font-size: 22px; line-height: 1.4;
                      color: rgba(255,255,255,0.72); }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="scene"><div class="wall">${cols.map(column).join("")}</div></div>
      <div class="veil shade"></div>
      <div class="veil glow"></div>
      <div class="veil focus"></div>
      <div class="brand">
        <div class="name">Zapp<span>.</span></div>
        <div class="claim">Film e serie, tutte le piattaforme, un&rsquo;unica app.</div>
      </div>
    </div>
    <script>
      const SET = ${SET};
      const cols = [...document.querySelectorAll(".col")];
      window.__frame = (t) => {
        for (const col of cols) {
          const dir = Number(col.dataset.dir);
          // in su: da 0 a -SET; in giu': da -SET a 0. In entrambi i casi a t=1 la
          // colonna e' tornata su una tile identica, quindi il giro non ha scatti.
          const y = dir < 0 ? -SET * t : -SET * (1 - t);
          col.style.transform = "translateY(" + y + "px)";
        }
      };
      window.__frame(0);
    </script>
  </body>
</html>`;
}

const list = await posters();
if (list.length < COLUMNS * PER_COL) {
  console.error(`Locandine insufficienti da TMDB: ${list.length}`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "zapp-wall-"));
const browser = await chromium.launch();
try {
  const p = await browser.newPage({
    viewport: { width: RENDER_W, height: RENDER_H },
    deviceScaleFactor: SCALE,
  });
  await p.setContent(page(list), { waitUntil: "load" });
  await p.waitForFunction(
    () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    { timeout: 60000 },
  );
  for (let k = 0; k < FRAMES; k++) {
    await p.evaluate((t) => window.__frame(t), k / FRAMES);
    await p.screenshot({ path: join(work, `f${String(k).padStart(3, "0")}.png`) });
  }
  console.log(`${readdirSync(work).length} fotogrammi resi in ${work}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const gif = join(OUT_DIR, "wall.gif");
  // Due passaggi: una tavolozza sola per tutta la GIF (piu' leggera di una per
  // fotogramma) e dithering leggero, che sulle locandine non fa banding.
  const filters =
    `scale=${OUT_W}:${OUT_H}:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=64:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(Math.round(100 / DELAY_CS)),
      "-i",
      join(work, "f%03d.png"),
      "-filter_complex",
      filters,
      "-loop",
      "0",
      gif,
    ],
    { stdio: "inherit" },
  );

  await sharp(join(work, "f000.png"))
    .resize(OUT_W, OUT_H)
    .jpeg({ quality: 78 })
    .toFile(join(OUT_DIR, "wall.jpg"));

  const { size } = await sharp(gif)
    .metadata()
    .then(async () => ({ size: (await import("node:fs")).statSync(gif).size }));
  console.log(
    `public/email/wall.gif — ${(size / 1024).toFixed(0)} KB, ${FRAMES} fotogrammi`,
  );
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
