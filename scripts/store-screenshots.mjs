/**
 * Screenshot per le schede degli store (App Store / Google Play), in formato telefono.
 *
 *   NEXT_DIST_DIR=.next-store pnpm build
 *   NEXT_DIST_DIR=.next-store pnpm exec next start -p 3408
 *   BASE=http://localhost:3408 node --env-file=.env.local scripts/store-screenshots.mjs
 *
 * Usa l'utente di test esistente (`zapptest@zapp.dev`, memoria di progetto), non uno
 * finto: la sua libreria (8 titoli), l'amicizia accettata e la posizione cinema
 * (Milano) già salvate rendono le pagine piene invece che vuote — le schede store
 * devono mostrare il prodotto vero, non uno stato "appena creato".
 *
 * Due formati telefono, uno per bottega — ma a `deviceScaleFactor: 2`, non 3: vedi il
 * commento su `FORMATI` per il perché (il tetto di 500 KB per file).
 * - iOS: viewport 430x932 → 860x1864
 * - Play: viewport 360x640 → 720x1280
 *
 * `serviceWorkers: "block"`: in build di produzione Serwist ripresenta l'HTML di una
 * build precedente (vedi nav-check.mjs, banner-check.mjs — stessa trappola).
 */
import { chromium } from "playwright";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3408";
const OUT = process.env.OUT ?? "docs/project/store/screenshots";
const EMAIL = "zapptest@zapp.dev";
const PASSWORD = "ZappTest2026!";
/** Stranger Things: nella libreria dell'utente di test, vista e votata 9 — una
 * scheda titolo con voto è più rappresentativa di una appena aggiunta. */
const TITLE_PATH = "/title/tv/66732";

/**
 * `deviceScaleFactor: 3` (le dimensioni esatte 1290x2796 / 1080x1920 chieste dalle
 * botteghe) produce PNG da 1-3 MB per le pagine con fondali fotografici (home, scheda
 * titolo, cinema): oltre il tetto di 500 KB del brief. Il brief stesso autorizza la
 * scappatoia "riduci il dsf a 2": a dsf 2 le stesse pagine restano sotto la soglia con
 * `sharp` in palette (vedi `comprimi`), e restano comunque immagini piene 860x1864 /
 * 720x1280 — non le dimensioni esatte dello store, ma materiale pronto a essere
 * ridimensionato a mano nel passo di submit (checklist.md).
 */
const FORMATI = [
  { cartella: "ios", width: 430, height: 932, deviceScaleFactor: 2 },
  { cartella: "android", width: 360, height: 640, deviceScaleFactor: 2 },
];

/** PNG con palette invece che a colori pieni: stesse dimensioni, stesso formato,
 * molto più leggero sulle pagine con fondali fotografici. Lossy sul colore (256 toni),
 * non sui pixel: a video non si vede la differenza su una UI scura come questa. */
async function comprimi(fileBuffer) {
  return sharp(fileBuffer)
    .png({ palette: true, quality: 85, compressionLevel: 9 })
    .toBuffer();
}

const PAGINE = [
  { nome: "01-home", path: "/" },
  { nome: "02-titolo", path: TITLE_PATH },
  { nome: "03-libreria", path: "/library" },
  { nome: "04-cinema", path: "/cinema" },
  { nome: "05-social", path: "/friends" },
  { nome: "06-devices", path: "/devices" },
];

/** Entra dal form vero: stessa trappola idratazione di banner-check.mjs (il campo si
 * svuota se riempito prima che React sia pronto). */
async function accedi(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const campoEmail = page.locator('input[type="email"]');
  await campoEmail.waitFor({ timeout: 40000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    await campoEmail.fill(EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    if ((await campoEmail.inputValue()) === EMAIL) break;
    await page.waitForTimeout(500);
  }
  if ((await campoEmail.inputValue()) !== EMAIL)
    throw new Error("il campo email si svuota: la pagina di accesso non è pronta");
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await accettaConsensiSePresenti(page);
}

/** L'utente di test ha accettato una versione vecchia di termini/privacy: al primo
 * accesso dopo un cambio versione il layout `(app)` mostra `ConsentGate` al posto
 * della pagina richiesta (vedi legal.md, "Dove si chiedono"). Va superato una volta,
 * non ad ogni pagina: dopo `router.refresh()` il gate sparisce per il resto della
 * sessione. */
async function accettaConsensiSePresenti(page) {
  const casella = page.locator('input[type="checkbox"]');
  if (!(await casella.count().catch(() => 0))) return;
  const continua = page.getByRole("button", { name: "Continua" });
  if (!(await continua.count().catch(() => 0))) return;
  await casella.first().check();
  await continua.click();
  await casella
    .first()
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
}

/** Il podio della domanda del giorno copre tutto (z-[60]) alla prima visita di oggi:
 * si chiude se compare, invece di segnare la domanda come vista via DB (l'utente di
 * test è condiviso con altri collaudi, meglio non toccargli le righe). */
async function chiudiPodioSePresente(page) {
  const chiudi = page.locator('button[aria-label="Chiudi"]');
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    if (!(await chiudi.count())) return;
    await chiudi
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(800);
  }
}

const risultati = [];

for (const formato of FORMATI) {
  const cartella = join(OUT, formato.cartella);
  mkdirSync(cartella, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: formato.width, height: formato.height },
    deviceScaleFactor: formato.deviceScaleFactor,
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  await accedi(page);
  await chiudiPodioSePresente(page);

  for (const pagina of PAGINE) {
    await page.goto(`${BASE}${pagina.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await chiudiPodioSePresente(page);
    // le immagini (locandine, fondali) arrivano dopo il primo paint
    await page.waitForTimeout(1500);
    const file = join(cartella, `${pagina.nome}.png`);
    const grezzo = await page.screenshot({ type: "png" });
    writeFileSync(file, await comprimi(grezzo));
    const { size } = statSync(file);
    risultati.push({ formato: formato.cartella, pagina: pagina.nome, file, size });
    console.log(
      `${formato.cartella}/${pagina.nome}.png — ${(size / 1024).toFixed(0)} KB`,
    );
  }

  await context.close();
  await browser.close();
}

const troppoGrandi = risultati.filter((r) => r.size > 500 * 1024);
if (troppoGrandi.length) {
  console.error("Oltre 500 KB:", troppoGrandi.map((r) => r.file).join(", "));
  process.exitCode = 1;
}
