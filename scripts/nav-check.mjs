/**
 * Verifica della navigazione contro un'istanza avviata: da ogni pagina che non è una
 * voce di nav si torna indietro (tondo + briciola) e fra le stagioni di una serie si
 * passa dalle pillole.
 *
 *   NEXT_DIST_DIR=.next-nav pnpm build
 *   NEXT_DIST_DIR=.next-nav pnpm exec next start -p 3399
 *   BASE=http://localhost:3399 node --env-file=.env.local scripts/nav-check.mjs
 *
 * Crea due utenti finti, entra dal form vero e li cancella alla fine.
 *
 * Due trappole, entrambe già costate un'ora:
 * - **il service worker**: in build di produzione Serwist ripresenta l'HTML di una build
 *   precedente e la pagina arriva coi chunk sbagliati (CSS 404, click a vuoto, elementi
 *   senza stile). Il contesto va aperto con `serviceWorkers: "block"`.
 * - **l'overlay della domanda del giorno**: si apre alla prima visita, è `z-[60]` e ha a
 *   sua volta un bottone "Indietro". Non si chiude dall'interfaccia (il tondo "Chiudi" sta
 *   dentro al riquadro e in mezzo all'animazione non è cliccabile): si segna la domanda di
 *   oggi come già vista in `daily_question_views` prima di aprire il browser.
 * - **la cartella di build**: `.next-nav` può essere in uso da un'altra sessione. Se i
 *   `.css` rispondono 404, la build è stata riscritta sotto al server: rifarla in una
 *   cartella con un nome nuovo.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3399";
/** Serie con almeno tre stagioni: Stranger Things. */
const TV_ID = 66732;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Nav!${Date.now()}aA1`;

async function makeUser(tag) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.nav.${tag}.${Date.now()}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", id);
  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", id)
    .single();
  // l'overlay della domanda del giorno copre tutto (z-60) e ha dentro un bottone
  // "Indietro": si segna la domanda di oggi come già vista, così non si apre mai
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
  return { id, email: data.user.email, username: profile.username };
}

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

const me = await makeUser("a");
const other = await makeUser("b");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', me.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  check("login", true, page.url());

  // --- stagione: pillole, sticky, frecce ---
  await page.goto(`${BASE}/title/tv/${TV_ID}/season/2`, {
    waitUntil: "domcontentloaded",
  });
  const pills = page.locator('nav[aria-label="Stagioni"] a');
  await pills.first().waitFor({ timeout: 30000 });
  const labels = await pills.allTextContents();
  check("pillole stagioni", labels.length >= 4, labels.join(" "));
  check(
    "pillola attiva = S2",
    (
      await page
        .locator('nav[aria-label="Stagioni"] a[aria-current="page"]')
        .textContent()
    )?.trim() === "S2",
  );

  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(300);
  const box = await page.locator('nav[aria-label="Stagioni"]').boundingBox();
  check(
    "riga sticky visibile dopo lo scroll",
    !!box && box.y >= -1 && box.y < 60,
    `y=${box?.y}`,
  );

  const endTexts = await page
    .locator('nav[aria-label="Altre stagioni"] a')
    .allTextContents();
  check(
    "frecce prec/succ",
    endTexts.length === 2,
    endTexts.join(" | ").replace(/\s+/g, " "),
  );

  await page.locator('nav[aria-label="Stagioni"] a', { hasText: /^S3$/ }).click();
  await page.waitForURL(/season\/3$/, { timeout: 30000 });
  check(
    "S2 → S3 dalla pillola",
    (
      await page
        .locator('nav[aria-label="Stagioni"] a[aria-current="page"]')
        .textContent()
    )?.trim() === "S3",
  );

  await page.goto(`${BASE}/title/tv/${TV_ID}/season/1`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator('nav[aria-label="Altre stagioni"]')
    .first()
    .waitFor({ timeout: 30000 });
  check(
    "prima stagione: solo 'successiva'",
    (await page.locator('nav[aria-label="Altre stagioni"] a').count()) === 1,
  );

  // --- indietro e briciole ---
  await page.goto(`${BASE}/discover`, { waitUntil: "domcontentloaded" });
  check(
    "indietro su /discover",
    (await page.locator('header button[aria-label="Indietro"]').count()) === 1,
  );

  await page.goto(`${BASE}/discover?type=movie&genre=28`, {
    waitUntil: "domcontentloaded",
  });
  check(
    "genere: indietro + briciola Scopri",
    (await page.locator('header button[aria-label="Indietro"]').count()) === 1 &&
      (await page.locator('[data-crumb][href="/discover"]').count()) === 1,
  );

  await page.goto(`${BASE}/u/${other.username}`, { waitUntil: "domcontentloaded" });
  check(
    "profilo utente: indietro + briciola Amici",
    (await page.locator('button[aria-label="Indietro"]').count()) === 1 &&
      (await page.locator('[data-crumb][href="/friends"]').count()) === 1,
  );

  await page.goto(`${BASE}/import/netflix`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 30000 });
  check(
    "import: briciola Profilo",
    (await page.locator('[data-crumb][href="/profile"]').count()) === 1,
  );

  // la vista per film di /cinema esiste solo con una posizione salvata
  await admin.from("user_locations").upsert({
    user_id: me.id,
    lat: 45.4642,
    lng: 9.19,
    label: "Milano",
    province_slug: "milano",
  });
  await page.goto(`${BASE}/cinema?film=1061474`, { waitUntil: "domcontentloaded" });
  // la testata definitiva arriva in streaming: prima c'è ancora quella di loading.tsx
  await page.locator('[data-crumb][href="/cinema"]').waitFor({ timeout: 30000 });
  check(
    "cinema/film: indietro + briciola Cinema",
    (await page.locator('header button[aria-label="Indietro"]').count()) === 1 &&
      (await page.locator('[data-crumb][href="/cinema"]').count()) === 1 &&
      (await page.getByText("Tutti i cinema").count()) === 0,
  );

  // --- desktop: la riga sticky scende sotto la barra alta ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/title/tv/${TV_ID}/season/2`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('nav[aria-label="Stagioni"]').waitFor({ timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(300);
  const boxLg = await page.locator('nav[aria-label="Stagioni"]').boundingBox();
  check(
    "desktop: sticky sotto la nav (>= 72px)",
    !!boxLg && boxLg.y >= 70 && boxLg.y < 140,
    `y=${boxLg?.y}`,
  );
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(me.id);
  await admin.auth.admin.deleteUser(other.id);
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
