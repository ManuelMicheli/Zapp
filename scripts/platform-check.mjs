/**
 * Verifica delle pillole "per piattaforma" contro un'istanza avviata: la fila in home
 * c'è, e la pagina di un servizio si apre piena — anche quella di un servizio piccolo
 * come RaiPlay, che è il caso in cui le soglie di voti rischiano di svuotare la lista.
 *
 *   NEXT_DIST_DIR=.next-platform pnpm build
 *   NEXT_DIST_DIR=.next-platform pnpm exec next start -p 3403
 *   BASE=http://localhost:3403 node --env-file=.env.local scripts/platform-check.mjs
 *
 * Crea un utente finto, entra dal form vero e lo cancella alla fine. Le due trappole di
 * `nav-check.mjs` valgono identiche: il **service worker** va bloccato (altrimenti
 * arriva l'HTML di una build vecchia) e la **domanda del giorno** va segnata come già
 * vista, o il suo overlay copre la pagina.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3403";
const SHOT = process.env.SHOT ?? ".shots";
mkdirSync(SHOT, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Plat!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.platform.${Date.now()}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  // Senza i consensi obbligatori il layout `(app)` mostra "Abbiamo aggiornato i
  // documenti" invece della home: le versioni stanno in `src/lib/legal/versions.ts`.
  await admin.from("user_consents").insert([
    { user_id: id, kind: "terms", version: "2026-09-12" },
    { user_id: id, kind: "privacy", version: "2026-09-12" },
  ]);
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
  if (today) {
    await admin
      .from("daily_question_views")
      .insert({ user_id: id, ask_on: today.ask_on });
  }
  return { id, email: data.user.email };
}

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

const me = await makeUser();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', me.email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 90_000 });
  await page.waitForTimeout(3000);

  // 1. la fila delle piattaforme sta in home, sotto quella dei generi. Le pillole
  // vivono sulla stessa rotta dei generi, quindi si distinguono per `data-platform-pill`.
  const pillole = await page.locator("a[data-platform-pill]").allInnerTexts();
  check("pillole delle piattaforme", pillole.length === 10, `${pillole.length} voci`);
  for (const nome of ["Netflix", "Prime Video", "Disney+", "NOW", "RaiPlay"]) {
    check(
      `c'e' ${nome}`,
      pillole.some((p) => p.trim() === nome),
      pillole.join(", "),
    );
  }
  const ordine = await page.evaluate(() => {
    const generi = document.querySelector(
      'a[href^="/discover/movie/"]:not([data-platform-pill])',
    );
    const piatta = document.querySelector("a[data-platform-pill]");
    if (!generi || !piatta) return "manca una delle due file";
    return generi.getBoundingClientRect().top < piatta.getBoundingClientRect().top
      ? null
      : "le piattaforme stanno sopra i generi";
  });
  check("le piattaforme stanno sotto i generi", ordine === null, String(ordine));
  await page.screenshot({ path: `${SHOT}/home-platforms.png`, fullPage: false });

  // 2. la pillola naviga davvero (non e' coperta e il percorso cambia)
  const coperta = await page.evaluate(() => {
    const a = document.querySelector('a[data-platform-pill][href$="/netflix"]');
    if (!a) return "manca la pillola";
    const r = a.getBoundingClientRect();
    const sopra = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return sopra && !a.contains(sopra) ? sopra.className || sopra.tagName : null;
  });
  check("la pillola Netflix non e' coperta", coperta === null, String(coperta));
  await page.click('a[data-platform-pill][href$="/netflix"]', { timeout: 15_000 });
  await page.waitForURL(/\/discover\/movie\/netflix$/, { timeout: 90_000 });
  await page.waitForTimeout(4000);
  const titolo = await page.locator("h1").first().innerText();
  check("titolo della pagina", titolo.trim() === "Su Netflix", titolo);
  const crumb = await page.locator("[data-crumb]").first().innerText();
  check("briciola a Scopri", crumb.trim() === "Scopri", crumb);
  const copertine = await page.locator('a[href^="/title/movie/"]').count();
  check("Netflix e' pieno", copertine >= 30, `${copertine} copertine`);
  await page.screenshot({ path: `${SHOT}/platform-netflix.png`, fullPage: false });

  // 3. la scheda Serie porta alle serie della stessa piattaforma. Si **clicca**: una
  // rotta propria per le piattaforme (`/discover/platform/...`) qui non navigava, ed e'
  // per questo che la piattaforma sta sulla rotta dei generi.
  await page.click('a[href="/discover/tv/netflix"]', { timeout: 15_000 });
  await page.waitForURL(/\/discover\/tv\/netflix$/, { timeout: 90_000 });
  await page.waitForTimeout(6000);
  const serie = await page.locator('a[href^="/title/tv/"]').count();
  const film = await page.locator('a[href^="/title/movie/"]').count();
  check("sotto Serie ci sono solo serie", serie >= 20 && film === 0, `${serie}/${film}`);

  // 4. il caso difficile: un servizio col catalogo piccolo non resta vuoto
  for (const [key, min] of [
    ["raiplay", 10],
    ["discovery-plus", 10],
    ["apple-tv", 10],
  ]) {
    await page.goto(`${BASE}/discover/movie/${key}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const n = await page.locator('a[href^="/title/movie/"]').count();
    check(`${key} non e' vuoto`, n >= min, `${n} copertine`);
  }

  // 5. una chiave inventata da' la pagina "non trovata", non una lista a caso
  await page.goto(`${BASE}/discover/movie/non-esiste`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const corpo = await page.locator("body").innerText();
  check(
    "chiave inventata -> non trovata",
    /404|non trovat|not be found/i.test(corpo),
    corpo.slice(0, 60).replace(/\s+/g, " "),
  );
  // 6. telefono: la scritta "Per piattaforma" sta sotto "Per genere" e apre il foglio
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    storageState: await context.storageState(),
  });
  const tel = await mobile.newPage();
  await tel.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await tel.waitForTimeout(4000);
  const scritte = await tel.evaluate(() => {
    const bottoni = [...document.querySelectorAll("button")].filter((b) =>
      /Per genere|Per piattaforma/.test(b.textContent ?? ""),
    );
    return bottoni.map((b) => ({
      testo: (b.textContent ?? "").trim(),
      top: Math.round(b.getBoundingClientRect().top),
    }));
  });
  const genere = scritte.find((s) => s.testo === "Per genere");
  const piatta = scritte.find((s) => s.testo === "Per piattaforma");
  check(
    "sul telefono ci sono le due scritte",
    Boolean(genere && piatta),
    JSON.stringify(scritte),
  );
  check(
    "sul telefono le piattaforme stanno sotto",
    Boolean(genere && piatta && genere.top < piatta.top),
    JSON.stringify(scritte),
  );
  await tel.getByRole("button", { name: "Per piattaforma" }).click({ timeout: 15_000 });
  await tel.waitForTimeout(1200);
  const nelFoglio = await tel.locator('[role="dialog"] a[data-platform-pill]').count();
  check("il foglio elenca le piattaforme", nelFoglio === 10, `${nelFoglio} voci`);
  await tel.screenshot({ path: `${SHOT}/platform-sheet-mobile.png` });
  await tel.keyboard.press("Escape");
  await tel.waitForTimeout(800);
  await tel.screenshot({ path: `${SHOT}/home-platforms-mobile.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(me.id);
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
}
