/**
 * Collaudo del banner a filo pagina in home e in cerca.
 *
 *   NEXT_DIST_DIR=.next-banner pnpm build
 *   NEXT_DIST_DIR=.next-banner pnpm exec next start -p 3402
 *   BASE=http://localhost:3402 node --env-file=.env.local <questo file>
 *
 * Crea un utente finto, entra dal form vero, misura e fotografa, poi lo cancella.
 * `serviceWorkers: "block"`: in build di produzione Serwist ripresenta l'HTML vecchio.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3402";
const OUT = process.env.OUT ?? "shots";
mkdirSync(OUT, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("mancano le env di Supabase");
const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Ban!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.banner.${Date.now()}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", id);
  const { data: today } = await admin
    .from("daily_questions")
    .select("ask_on")
    .lte("ask_on", new Date().toISOString().slice(0, 10))
    .order("ask_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (today)
    await admin
      .from("daily_question_views")
      .insert({ user_id: id, ask_on: today.ask_on });
  return { id, email: data.user.email };
}

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

/**
 * Entra dal form vero. Il campo va riempito **dopo** l'idratazione e riletto: sul sito
 * in rete la pagina di accesso arriva col muro di locandine e il foglio che si anima, e
 * un `fill` troppo presto viene azzerato da React — il form finiva svuotato e il
 * browser si fermava su "Please fill out this field".
 */
async function accedi(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const campoEmail = page.locator('input[type="email"]');
  await campoEmail.waitFor({ timeout: 40000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    await campoEmail.fill(email);
    await page.fill('input[type="password"]', password);
    if ((await campoEmail.inputValue()) === email) break;
    await page.waitForTimeout(500);
  }
  if ((await campoEmail.inputValue()) !== email)
    throw new Error("il campo email si svuota: la pagina di accesso non è pronta");
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
}

/**
 * Il podio della domanda del giorno si apre a tutto schermo sopra la home. Lo si
 * provoca da soli: segnando la domanda come già vista (vedi `makeUser`) l'app mostra i
 * risultati invece della domanda. Ha un tondo "Chiudi", e senza chiuderlo il carosello
 * resta dietro un velo `z-[60]` e il collaudo aspetta un'immagine che non vedrà mai.
 */
async function chiudiPodio(page) {
  const chiudi = page.locator('button[aria-label="Chiudi"]');
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    if (!(await chiudi.count())) return;
    await chiudi.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

/**
 * Vero se il punto centrale dell'elemento appartiene davvero a lui: i riquadri di
 * Playwright ignorano chi ci sta sopra, e una scritta coperta dall'immagine passava il
 * controllo pur essendo invisibile.
 */
async function inVista(page, selettore) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(sopra && (el.contains(sopra) || sopra.contains(el)));
  }, selettore);
}

/**
 * Il muro del consenso ("Abbiamo aggiornato i documenti") sta davanti a tutta l'app
 * per chi non ha ancora accettato condizioni e privacy: un utente appena creato lo
 * trova al primo ingresso e senza spuntarlo non si vede nessuna pagina.
 */
async function accettaDocumenti(page) {
  const spunta = page.locator('input[type="checkbox"]');
  if (!(await spunta.count())) return;
  await spunta.first().check();
  await page.locator("button", { hasText: /^Continua$/ }).click({ noWaitAfter: true });
  await page.waitForTimeout(1500);
}

/** Il primo fondale del primo banner della pagina: riquadro e distanza dalla cima. */
async function misura(page) {
  return page.evaluate(() => {
    const img = document.querySelector("section[aria-label] a img");
    const media = img?.closest("div");
    if (!media) return null;
    const r = media.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height, width: r.width };
  });
}

const me = await makeUser();
const browser = await chromium.launch();

try {
  for (const [tag, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 900 }],
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    const page = await context.newPage();
    await accedi(page, me.email);
    await accettaDocumenti(page);
    await chiudiPodio(page);

    // --- home ---
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator('section[aria-label="In evidenza"] img').first().waitFor({
      timeout: 40000,
    });
    await page.waitForTimeout(1200);
    const home = await misura(page);
    const h1 = await page.locator("h1", { hasText: "Home" }).boundingBox();
    check(
      `home ${tag}: fondale a filo pagina`,
      home && home.top <= 1,
      JSON.stringify(home),
    );
    // sotto `lg` cresce il riquadro 16:9 di `--banner-top`; da `lg` cresce la card,
    // 64svh più `--banner-top` (che lì comprende la fascia della nav, 72px)
    const attesa = tag === "mobile" ? (390 * 9) / 16 + 72 : 900 * 0.64 + 160;
    check(
      `home ${tag}: fondale esteso in alto`,
      Math.abs(home.height - attesa) < 8,
      `h=${home.height} attesa≈${Math.round(attesa)}`,
    );
    check(
      `home ${tag}: "Home" sull'immagine e in vista`,
      h1 &&
        h1.y >= 0 &&
        h1.y + h1.height <= home.top + home.height &&
        (await inVista(page, "h1")),
      `h1 y=${h1?.y}`,
    );
    // la pillola del motivo appesa sotto la scritta, non venti pixel più in giù
    const chip = await page
      .locator("section[aria-label] a span.glass")
      .first()
      .boundingBox();
    check(
      `home ${tag}: pillola del motivo sotto "Home"`,
      chip && h1 && chip.y >= h1.y + h1.height - 2 && chip.y <= h1.y + h1.height + 24,
      `chip y=${chip?.y}, "Home" finisce a ${h1 ? Math.round(h1.y + h1.height) : "?"}`,
    );

    // le pillole non stanno più sull'immagine
    const pillole = await page
      .locator('[role="tablist"][aria-label*="film"]')
      .boundingBox();
    check(
      `home ${tag}: pillola tipo sotto il banner`,
      pillole && pillole.y >= home.top + home.height - 1,
      `pillole y=${pillole?.y}, banner finisce a ${Math.round(home.top + home.height)}`,
    );
    check(
      `home ${tag}: pillola tipo centrata`,
      pillole && Math.abs(pillole.x + pillole.width / 2 - viewport.width / 2) < 2,
      `centro ${pillole ? Math.round(pillole.x + pillole.width / 2) : "?"} su ${viewport.width / 2}`,
    );
    await page.screenshot({ path: `${OUT}/home-${tag}.png` });

    // --- cerca ---
    await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded" });
    await page.locator("section[aria-label] img").first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1200);
    const cerca = await misura(page);
    check(
      `cerca ${tag}: fondale a filo pagina`,
      cerca && cerca.top <= 1,
      JSON.stringify(cerca),
    );
    const bar = await page.locator('input[type="search"]').boundingBox();
    check(
      `cerca ${tag}: barra sopra il fondale`,
      bar && cerca && bar.y > cerca.top && bar.y + bar.height < cerca.top + cerca.height,
      `barra y=${bar?.y}`,
    );
    // titolo della fila e pillole mood: sotto il banner, non sull'immagine
    const testata = await page
      .locator("section[aria-label] ~ div h2, h2")
      .first()
      .boundingBox();
    check(
      `cerca ${tag}: titolo della fila sotto il banner`,
      testata && testata.y >= cerca.top + cerca.height - 1,
      `h2 y=${testata?.y}, banner finisce a ${Math.round(cerca.top + cerca.height)}`,
    );
    check(
      `cerca ${tag}: titolo della fila centrato`,
      testata && Math.abs(testata.x + testata.width / 2 - viewport.width / 2) < 2,
      `centro ${testata ? Math.round(testata.x + testata.width / 2) : "?"} su ${viewport.width / 2}`,
    );
    await page.screenshot({ path: `${OUT}/search-${tag}.png` });

    // pannello recenti: non deve spostare il banner
    await page.locator('input[type="search"]').click();
    await page.waitForTimeout(400);
    const dopo = await misura(page);
    check(
      `cerca ${tag}: il fuoco non sposta il banner`,
      dopo && Math.abs(dopo.top - cerca.top) < 2,
      `prima=${cerca.top} dopo=${dopo?.top}`,
    );

    // digitando: la barra torna col fondo pieno e il banner sparisce
    await page.fill('input[type="search"]', "matrix");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/search-typing-${tag}.png` });
    const barDopo = await page.locator('input[type="search"]').boundingBox();
    check(
      `cerca ${tag}: barra al suo posto digitando`,
      barDopo && barDopo.y < 140,
      `y=${barDopo?.y}`,
    );

    await context.close();
  }
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(me.id);
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
