/**
 * E2E mirato della ricerca rapida nei dettagli di una lista.
 * Crea owner, viewer e lista temporanei; elimina sempre gli utenti al termine.
 *
 *   BASE=http://localhost:3417 node --env-file=.env.local scripts/list-search-check.mjs
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3417";
const SHOT = process.env.SHOT ?? "artifacts/list-search-check";
const REQUIRED_CONSENT_VERSIONS = { terms: "2026-09-12", privacy: "2026-09-12" };
const SEARCH_LABEL = "Cerca film e serie";
const MOCK_OLD = "Risultato vecchio";
const MOCK_NEW = "Risultato nuovo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Variabili Supabase mancanti.");
  process.exit(1);
}

mkdirSync(SHOT, { recursive: true });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const createdUserIds = [];
const checks = [];
const runtimeErrors = [];
let browser;

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), ...(detail ? { detail: String(detail) } : {}) });
}

function safeError(error) {
  return String(error?.message ?? error)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

function bounded(promise, name, timeout = 10_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${name}`)), timeout),
    ),
  ]);
}

function resultTitle(page, title) {
  return page.locator("li").filter({ hasText: title }).locator("p").first();
}

async function createFixtureUser(tag) {
  const stamp = `${Date.now()}.${randomUUID().slice(0, 8)}`;
  const email = `zapp.list-search.${tag}.${stamp}@example.com`;
  const password = `Search-${randomUUID()}-aA1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  createdUserIds.push(id);

  const onboarding = await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", id);
  if (onboarding.error) throw onboarding.error;
  const consents = await admin.from("user_consents").insert(
    Object.entries(REQUIRED_CONSENT_VERSIONS).map(([kind, version]) => ({
      user_id: id,
      kind,
      version,
    })),
  );
  if (consents.error) throw consents.error;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id, email, password, client };
}

async function markDailyQuestionSeen(userIds) {
  const today = await admin
    .from("daily_questions")
    .select("ask_on")
    .lte("ask_on", new Date().toISOString().slice(0, 10))
    .order("ask_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (today.error) throw today.error;
  if (!today.data) return;
  const inserted = await admin.from("daily_question_views").upsert(
    userIds.map((user_id) => ({ user_id, ask_on: today.data.ask_on })),
    { onConflict: "user_id,ask_on" },
  );
  if (inserted.error) throw inserted.error;
}

async function login(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  const navigation = page.waitForURL(
    (current) => !current.pathname.startsWith("/login"),
    {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    },
  );
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await navigation;
}

function mockItem(id, title) {
  return {
    id,
    mediaType: "movie",
    title,
    posterPath: null,
    year: "2026",
    voteAverage: 7,
    providers: [],
  };
}

async function assertResponsiveSearch(page, listUrl, width) {
  await page.setViewportSize({ width, height: width === 320 ? 760 : 900 });
  await page.goto(listUrl, { waitUntil: "domcontentloaded" });
  const input = page.getByRole("searchbox", { name: SEARCH_LABEL, exact: true });
  await input.waitFor({ timeout: 30_000 });
  const geometry = await input.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      right: Math.round(box.right),
      width: Math.round(box.width),
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  check(`ricerca ${width}px: input visibile`, await input.isVisible());
  check(
    `ricerca ${width}px: nessun overflow`,
    geometry.left >= 0 &&
      geometry.right <= geometry.viewport + 1 &&
      geometry.scrollWidth <= geometry.viewport + 1,
    JSON.stringify(geometry),
  );
  await page.screenshot({ path: `${SHOT}/owner-${width}.png`, fullPage: true });
  return input;
}

try {
  const owner = await createFixtureUser("owner");
  const viewer = await createFixtureUser("viewer");
  await markDailyQuestionSeen(createdUserIds);

  const listId = randomUUID();
  const listName = `Ricerca rapida ${Date.now()}`;
  const listInsert = await owner.client.from("title_lists").insert({
    id: listId,
    owner_id: owner.id,
    name: listName,
    description: "Fixture E2E temporanea",
    default_role: "viewer",
  });
  if (listInsert.error) throw listInsert.error;
  const membersInsert = await owner.client.from("title_list_members").insert([
    { list_id: listId, user_id: owner.id, role: "owner" },
    { list_id: listId, user_id: viewer.id, role: "viewer" },
  ]);
  if (membersInsert.error) throw membersInsert.error;

  browser = await chromium.launch();
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "allow",
  });
  const ownerPage = await ownerContext.newPage();
  ownerPage.on("pageerror", (error) =>
    runtimeErrors.push(`owner: ${String(error.stack ?? error.message)}`),
  );
  await login(ownerPage, owner);
  const listUrl = `${BASE}/lists/${listId}`;
  const input = await assertResponsiveSearch(ownerPage, listUrl, 1440);
  const searchSection = input.locator("xpath=ancestor::section");
  const cdp = await ownerContext.newCDPSession(ownerPage);
  await cdp.send("Network.enable");
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  await input.fill("i");
  await ownerPage
    .getByRole("button", { name: "Cancella ricerca", exact: true })
    .waitFor({ timeout: 10_000 });
  await input.fill("");

  let oldRequested;
  let clearRequested;
  let errorRequested;
  let newRequestCount = 0;
  const oldRequestSeen = new Promise((resolve) => {
    oldRequested = resolve;
  });
  const clearRequestSeen = new Promise((resolve) => {
    clearRequested = resolve;
  });
  const errorRequestSeen = new Promise((resolve) => {
    errorRequested = resolve;
  });
  await ownerPage.route("**/api/search**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "vecchio") {
      oldRequested();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route
        .fulfill({ json: { results: [mockItem(910001, MOCK_OLD)] } })
        .catch(() => {});
      return;
    }
    if (query === "nuovo") {
      newRequestCount += 1;
      await route.fulfill({ json: { results: [mockItem(910002, MOCK_NEW)] } });
      return;
    }
    if (query === "cancella") {
      clearRequested();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route
        .fulfill({ json: { results: [mockItem(910003, "Risultato cancellato")] } })
        .catch(() => {});
      return;
    }
    if (query === "errore") {
      errorRequested();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route
        .fulfill({ status: 502, json: { error: "Errore di ricerca" } })
        .catch(() => {});
      return;
    }
    await route.continue();
  });

  await input.fill("vecchio");
  await bounded(oldRequestSeen, "richiesta vecchio");
  await input.fill("nuovo");
  await resultTitle(ownerPage, MOCK_NEW).waitFor({ timeout: 10_000 });
  await ownerPage.waitForTimeout(650);
  check(
    "una risposta vecchia non sostituisce la nuova",
    (await resultTitle(ownerPage, MOCK_OLD).count()) === 0,
  );

  await input.fill("nuovo ");
  await ownerPage.waitForTimeout(200);
  check(
    "lo spazio finale conserva il risultato senza nuova ricerca",
    (await resultTitle(ownerPage, MOCK_NEW).count()) === 1 &&
      (await ownerPage.getByLabel("Ricerca in corso").count()) === 0 &&
      newRequestCount === 1,
    `richieste=${newRequestCount}`,
  );

  await input.fill("cancella");
  await bounded(clearRequestSeen, "richiesta cancellata");
  await ownerPage.getByRole("button", { name: "Cancella ricerca", exact: true }).click();
  await ownerPage.waitForTimeout(500);
  const clearState = {
    value: await input.inputValue(),
    resultCount: await resultTitle(searchSection, "Risultato cancellato").count(),
    alertCount: await searchSection.getByRole("alert").count(),
    spinnerCount: await searchSection.getByLabel("Ricerca in corso").count(),
  };
  check(
    "cancellare durante la richiesta lascia campo e risultati vuoti",
    clearState.value === "" &&
      clearState.resultCount === 0 &&
      clearState.alertCount === 0 &&
      clearState.spinnerCount === 0,
    JSON.stringify(clearState),
  );

  await input.fill("errore");
  await bounded(errorRequestSeen, "richiesta errore obsoleta");
  await input.fill("nuovo");
  await resultTitle(ownerPage, MOCK_NEW).waitFor({ timeout: 10_000 });
  await ownerPage.waitForTimeout(500);
  const staleErrorState = {
    resultCount: await resultTitle(searchSection, MOCK_NEW).count(),
    alertCount: await searchSection.getByRole("alert").count(),
    spinnerCount: await searchSection.getByLabel("Ricerca in corso").count(),
  };
  check(
    "un errore 502 obsoleto non sostituisce il risultato corrente",
    staleErrorState.resultCount === 1 &&
      staleErrorState.alertCount === 0 &&
      staleErrorState.spinnerCount === 0,
    JSON.stringify(staleErrorState),
  );

  await input.fill("errore");
  const errorMessage = searchSection
    .getByRole("alert")
    .filter({ hasText: /ricerca|riprova/i });
  await errorMessage.waitFor({ timeout: 10_000 });
  check("errore 502 mostrato", await errorMessage.isVisible());
  await ownerPage.getByRole("button", { name: "Cancella ricerca", exact: true }).click();
  check("cancellazione svuota il campo", (await input.inputValue()) === "");
  check(
    "cancellazione svuota i risultati",
    (await ownerPage.getByText(MOCK_NEW).count()) === 0,
  );
  await ownerPage.unroute("**/api/search**");
  await cdp.send("Network.setBypassServiceWorker", { bypass: false });

  await input.fill("Inception");
  const addInception = ownerPage
    .getByRole("button", { name: /^Aggiungi Inception/ })
    .first();
  await addInception.waitFor({ timeout: 30_000 });
  await addInception.click();
  const removeInception = ownerPage.getByRole("button", { name: /^Rimuovi Inception/ });
  await removeInception.waitFor({ timeout: 30_000 });
  check("Inception aggiunto a Nella lista", await removeInception.isVisible());
  const alreadyInList = ownerPage.getByText("Già nella lista", { exact: true }).first();
  await alreadyInList.waitFor({ timeout: 30_000 });
  check("il risultato segnala Già nella lista", await alreadyInList.isVisible());
  await removeInception.click();
  await addInception.waitFor({ timeout: 30_000 });
  await ownerPage.waitForFunction(
    (label) => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        element.getAttribute("aria-label")?.startsWith(label),
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    "Aggiungi Inception",
    { timeout: 30_000 },
  );
  check("Inception torna aggiungibile dopo la rimozione", await addInception.isEnabled());
  await addInception.click();
  await removeInception.waitFor({ timeout: 30_000 });
  check("Inception si può riaggiungere", await removeInception.isVisible());

  const mobileInput = await assertResponsiveSearch(ownerPage, listUrl, 320);
  await mobileInput.fill("Inception");
  await ownerPage
    .getByRole("button", { name: /^Aggiungi Inception/ })
    .first()
    .waitFor({ timeout: 30_000 });
  await ownerPage.screenshot({ path: `${SHOT}/owner-320-results.png`, fullPage: true });
  await ownerContext.close();

  const viewerContext = await browser.newContext({
    viewport: { width: 320, height: 760 },
    serviceWorkers: "allow",
  });
  const viewerPage = await viewerContext.newPage();
  viewerPage.on("pageerror", (error) =>
    runtimeErrors.push(`viewer: ${String(error.stack ?? error.message)}`),
  );
  await login(viewerPage, viewer);
  await viewerPage.goto(listUrl, { waitUntil: "domcontentloaded" });
  await viewerPage.getByRole("heading", { name: listName, exact: true }).waitFor({
    timeout: 30_000,
  });
  check(
    "il viewer non vede la ricerca",
    (await viewerPage
      .getByRole("searchbox", { name: SEARCH_LABEL, exact: true })
      .count()) === 0,
  );
  await viewerPage.screenshot({ path: `${SHOT}/viewer-320.png`, fullPage: true });
  await viewerContext.close();
} catch (error) {
  check("esecuzione completa", false, safeError(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const userId of createdUserIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error)
      check(`cleanup utente ${userId.slice(0, 8)}`, false, deleted.error.message);
  }
}

check(
  "nessun errore runtime",
  runtimeErrors.length === 0,
  runtimeErrors.slice(0, 3).join(" | "),
);

const report = {
  ok: checks.every((entry) => entry.ok),
  base: BASE,
  checks,
  runtimeErrors,
  screenshots: SHOT,
};
writeFileSync(`${SHOT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const result of checks) {
  console.log(
    `${result.ok ? "OK  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`,
  );
}
console.log(`Report: ${SHOT}/report.json`);
process.exit(report.ok ? 0 : 1);
