/**
 * Verifica della home filtrata (per genere, per piattaforma, tutti e due) contro
 * un'istanza avviata: le pillole cambiano l'ambito della home invece di aprire Scopri,
 * la navigazione avviene **con un click vero** (la trappola della query sullo stesso
 * pathname), la pillola attiva si toglie con un secondo tocco, il percorso non canonico
 * rimanda a quello canonico, e le home di un servizio piccolo o di un intreccio
 * difficile ("Storie vere su Netflix") non escono vuote.
 *
 *   NEXT_DIST_DIR=.next-scope pnpm build
 *   NEXT_DIST_DIR=.next-scope pnpm exec next start -p 3403
 *   BASE=http://localhost:3403 node --env-file=.env.local scripts/platform-check.mjs
 *
 * Crea un utente finto, entra dal form vero e lo cancella alla fine. Le due trappole di
 * `nav-check.mjs` valgono identiche: il **service worker** va bloccato (altrimenti
 * arriva l'HTML di una build vecchia) e la **domanda del giorno** va segnata come già
 * vista, o il suo overlay copre la pagina. E i consensi obbligatori vanno inseriti, o
 * il layout `(app)` mostra "Abbiamo aggiornato i documenti" al posto della home.
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

/** Quante copertine (film + serie) stanno in pagina. */
const copertine = (page) => page.locator('a[href^="/title/"]').count();
/** I titoli delle sezioni. */
const sezioni = async (page) =>
  (await page.locator("main h2").allInnerTexts()).map((t) => t.trim()).filter(Boolean);

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
  await page.waitForTimeout(4000);

  // 1. le due file di pillole puntano alla home filtrata, non a Scopri
  const generi = await page
    .locator("a[data-genre-pill]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const piattaforme = await page
    .locator("a[data-platform-pill]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("pillole dei generi", generi.length >= 15, `${generi.length} voci`);
  check(
    "pillole delle piattaforme",
    piattaforme.length === 10,
    `${piattaforme.length} voci`,
  );
  check(
    "i generi puntano a /home/<genere>",
    generi.every((h) => /^\/home\/[a-z0-9-]+$/.test(h ?? "")),
    generi.slice(0, 3).join(", "),
  );
  check(
    "le piattaforme puntano a /home/<piattaforma>",
    piattaforme.every((h) => /^\/home\/[a-z0-9-]+$/.test(h ?? "")),
    piattaforme.slice(0, 3).join(", "),
  );
  const sezioniIntere = await sezioni(page);
  const copertineIntere = await copertine(page);
  await page.screenshot({ path: `${SHOT}/home-intera.png` });

  // 2. click su Netflix: la home resta, l'URL cambia, la pillola e' attiva
  await page.click('a[data-platform-pill][href="/home/netflix"]', { timeout: 15_000 });
  await page.waitForURL(/\/home\/netflix$/, { timeout: 90_000 });
  await page.waitForTimeout(8000);
  const attivaNetflix = await page.locator('a[data-platform-pill][aria-current="page"]');
  check(
    "su /home/netflix la pillola Netflix e' attiva e il suo link la toglie",
    (await attivaNetflix.count()) === 1 &&
      (await attivaNetflix.innerText()).includes("Netflix") &&
      (await attivaNetflix.getAttribute("href")) === "/",
  );
  const sezioniNetflix = await sezioni(page);
  check(
    "su Netflix ci sono le sezioni della home",
    sezioniNetflix.some((s) => /Per te/.test(s)) &&
      sezioniNetflix.some((s) => /Top 10 su Netflix/.test(s)) &&
      sezioniNetflix.some((s) => /Novità su Netflix/.test(s)) &&
      sezioniNetflix.some((s) => /meglio votat/.test(s)),
    sezioniNetflix.join(" | "),
  );
  check(
    "su Netflix niente cinema ne' saghe",
    !sezioniNetflix.some((s) => /cinema|Saghe/i.test(s)),
    sezioniNetflix.join(" | "),
  );
  const copertineNetflix = await copertine(page);
  check(
    "Netflix e' piena",
    copertineNetflix >= 40,
    `${copertineNetflix} copertine (intera: ${copertineIntere}, ${sezioniIntere.length} sezioni)`,
  );
  await page.screenshot({ path: `${SHOT}/home-netflix.png` });

  // 3. la scheda "Serie TV" e' stato client: resta e filtra senza tornare al server
  await page.getByRole("tab", { name: "Serie TV" }).first().click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const serie = await page.locator('a[href^="/title/tv/"]').count();
  const film = await page.locator('a[href^="/title/movie/"]').count();
  check("sotto Serie TV solo serie", serie >= 10 && film === 0, `${serie}/${film}`);
  check("l'URL non si e' mosso", page.url().endsWith("/home/netflix"), page.url());
  await page.getByRole("tab", { name: "Tutto" }).first().click({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // 4. intreccio: Thriller sopra Netflix → /home/thriller/netflix
  await page.click('a[data-genre-pill][href="/home/thriller/netflix"]', {
    timeout: 15_000,
  });
  await page.waitForURL(/\/home\/thriller\/netflix$/, { timeout: 90_000 });
  await page.waitForTimeout(8000);
  const attive = await page.locator('a[aria-current="page"]').allInnerTexts();
  check(
    "su /home/thriller/netflix sono attive entrambe le pillole",
    attive.some((t) => /Thriller/.test(t)) && attive.some((t) => /Netflix/.test(t)),
    attive.join(", "),
  );
  const copertineIntreccio = await copertine(page);
  check(
    "Thriller su Netflix non e' vuota",
    copertineIntreccio >= 15,
    `${copertineIntreccio} copertine`,
  );
  const sezioniIntreccio = await sezioni(page);
  check(
    "Thriller su Netflix ha Per te",
    sezioniIntreccio.some((s) => /Per te/.test(s)),
    sezioniIntreccio.join(" | "),
  );
  await page.screenshot({ path: `${SHOT}/home-thriller-netflix.png` });

  // 5. secondo tocco sulla piattaforma attiva: resta solo il genere
  await page.click('a[data-platform-pill][aria-current="page"]', { timeout: 15_000 });
  await page.waitForURL(/\/home\/thriller$/, { timeout: 90_000 });
  await page.waitForTimeout(6000);
  const copertineThriller = await copertine(page);
  check(
    "Thriller da solo non e' vuota",
    copertineThriller >= 20,
    `${copertineThriller} copertine`,
  );
  const sezioniThriller = await sezioni(page);
  check(
    "su Thriller niente cinema ne' saghe",
    !sezioniThriller.some((s) => /cinema|Saghe/i.test(s)),
    sezioniThriller.join(" | "),
  );

  // 6. secondo tocco sul genere attivo: torna la home intera
  await page.click('a[data-genre-pill][aria-current="page"]', { timeout: 15_000 });
  await page.waitForURL(`${BASE}/`, { timeout: 90_000 });
  check("togliere l'ultimo filtro riporta a /", page.url() === `${BASE}/`, page.url());

  // 7. percorso non canonico → canonico; chiave inventata → 404
  await page.goto(`${BASE}/home/netflix/thriller`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/home\/thriller\/netflix$/, { timeout: 60_000 });
  check("/home/netflix/thriller rimanda a /home/thriller/netflix", true);
  await page.goto(`${BASE}/home/non-esiste`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const corpo = await page.locator("body").innerText();
  check(
    "chiave inventata -> non trovata",
    /404|non trovat|not be found/i.test(corpo),
    corpo.slice(0, 60).replace(/\s+/g, " "),
  );

  // 8. i casi difficili: servizio piccolo, voce da keyword, intreccio stretto
  for (const [percorso, min] of [
    ["raiplay", 10],
    ["discovery-plus", 6],
    ["storie-vere", 10],
    ["storie-vere/netflix", 6],
    ["anime/netflix", 6],
  ]) {
    await page.goto(`${BASE}/home/${percorso}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const n = await copertine(page);
    check(`/home/${percorso} non e' vuota`, n >= min, `${n} copertine`);
  }
  await page.screenshot({ path: `${SHOT}/home-anime-netflix.png` });

  // 9. telefono: le scritte, e quella attiva prende il nome del filtro
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    storageState: await context.storageState(),
  });
  const tel = await mobile.newPage();
  await tel.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await tel.waitForTimeout(4000);
  const scritte = await tel.evaluate(() =>
    [
      ...document.querySelectorAll("button[data-genre-chip], button[data-platform-chip]"),
    ].map((b) => ({
      testo: (b.textContent ?? "").trim(),
      top: Math.round(b.getBoundingClientRect().top),
    })),
  );
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
  await tel.locator("button[data-platform-chip]").click({ timeout: 15_000 });
  await tel.waitForTimeout(1200);
  const nelFoglio = await tel.locator('[role="dialog"] a[data-platform-pill]').count();
  check("il foglio elenca le piattaforme", nelFoglio === 10, `${nelFoglio} voci`);
  await tel.screenshot({ path: `${SHOT}/platform-sheet-mobile.png` });
  await tel
    .locator('[role="dialog"] a[data-platform-pill][href="/home/netflix"]')
    .click();
  await tel.waitForURL(/\/home\/netflix$/, { timeout: 90_000 });
  await tel.waitForTimeout(6000);
  const chipAttiva = (await tel.locator("button[data-platform-chip]").innerText()).trim();
  check(
    "sul telefono la scritta diventa il nome del servizio",
    chipAttiva === "Netflix",
    chipAttiva,
  );
  await tel.locator("button[data-platform-chip]").click({ timeout: 15_000 });
  await tel.waitForTimeout(1000);
  // due link a `/`: la voce «Tutte le piattaforme» e la pillola attiva, che si toglie
  const togli = await tel
    .locator('[role="dialog"] a[href="/"]', { hasText: "Tutte le piattaforme" })
    .count();
  check("nel foglio c'e' «Tutte le piattaforme»", togli === 1, `${togli}`);
  await tel.keyboard.press("Escape");
  await tel.waitForTimeout(800);
  await tel.screenshot({ path: `${SHOT}/home-netflix-mobile.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(me.id);
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
}
