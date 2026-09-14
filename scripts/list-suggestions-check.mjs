/**
 * Banco E2E dei suggerimenti personali e condivisi.
 * Crea quattro utenti temporanei e li elimina sempre al termine.
 *
 *   BASE=http://localhost:3417 node --env-file=.env.local scripts/list-suggestions-check.mjs
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3417";
const SHOT = process.env.SHOT ?? "artifacts/list-suggestions-check";
const REQUIRED_CONSENT_VERSIONS = { terms: "2026-09-12", privacy: "2026-09-12" };
mkdirSync(SHOT, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Variabili Supabase mancanti.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const createdUserIds = [];
const checks = [];
const runtimeErrors = [];
const notes = [
  "Il componente Sheet globale non implementa ancora un focus trap; questo banco verifica la navigazione dei controlli della lista senza ampliare lo scope.",
];
let browser;
let page;
let suggestionGridSeen = false;

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), ...(detail ? { detail: String(detail) } : {}) });
}

function safeError(error) {
  return String(error?.message ?? error)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

function sameJson(a, b) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    }
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

async function createFixtureUser(tag) {
  const stamp = `${Date.now()}.${randomUUID().slice(0, 8)}`;
  const email = `zapp.list-suggestions.${tag}.${stamp}@example.com`;
  const password = `Lst-${randomUUID()}-aA1!`;
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
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id, email, password, client };
}

async function seedTaste(userId, generi, massa = 40) {
  const result = await admin.from("user_taste").upsert({
    user_id: userId,
    generi,
    decenni: {},
    provider: {},
    persone: {},
    tipo: {},
    runtime: {},
    lingua: {},
    massa,
    eventi_contati: Math.ceil(massa),
    updated_at: new Date().toISOString(),
  });
  if (result.error) throw result.error;
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

async function grantRequiredConsents(userIds) {
  const inserted = await admin.from("user_consents").insert(
    userIds.flatMap((user_id) =>
      Object.entries(REQUIRED_CONSENT_VERSIONS).map(([kind, version]) => ({
        user_id,
        kind,
        version,
      })),
    ),
  );
  if (inserted.error) throw inserted.error;
}

async function rpcProfile(client, listId) {
  return client.rpc("list_recommendation_profile", { p_list_id: listId });
}

async function login(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  const navigation = page.waitForURL((current) => !current.pathname.startsWith("/login"), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await navigation;
}

async function screenshotPainted(page, path) {
  const paintOverride = await page.addStyleTag({
    content: "* { content-visibility: visible !important; }",
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 800;
  for (let top = 0; top < height; top += Math.max(200, viewport - 100)) {
    await page.evaluate((nextTop) => window.scrollTo(0, nextTop), top);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path, fullPage: true });
  await paintOverride.evaluate((element) => element.remove());
}

async function measureDialog(page, expectedWidth) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 20_000 });
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      left: Math.round(box.left),
      right: Math.round(box.right),
      viewport: document.documentElement.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  check(
    `dialog personale ${expectedWidth}px: larghezza proporzionata`,
    expectedWidth >= 1000
      ? geometry.width >= 560 && geometry.width <= 660
      : geometry.width <= geometry.viewport,
    JSON.stringify(geometry),
  );
  check(
    `dialog personale ${expectedWidth}px: nessun overflow orizzontale`,
    geometry.scrollWidth <= geometry.clientWidth + 1 &&
      geometry.left >= -1 &&
      geometry.right <= geometry.viewport + 1,
    JSON.stringify(geometry),
  );
  const nameField = dialog.locator("#list-name");
  await nameField.focus();
  await page.keyboard.press("Tab");
  check(
    `dialog personale ${expectedWidth}px: campi raggiungibili da tastiera`,
    (await page.evaluate(() => document.activeElement?.id)) === "list-description",
  );
  const submit = dialog.getByRole("button", { name: "Crea lista", exact: true });
  await nameField.fill("Prova accessibilità");
  await submit.waitFor({ state: "visible" });
  if (await submit.isDisabled()) throw new Error("Invio ancora disabilitato con nome valido");
  await submit.focus();
  check(
    `dialog personale ${expectedWidth}px: invio raggiungibile da tastiera`,
    await submit.evaluate((element) => element === document.activeElement),
  );
  await nameField.fill("");
  await screenshotPainted(page, `${SHOT}/dialog-personale-${expectedWidth}.png`);
}

async function measureSharedDialog(page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Condivisa/ }).click();
  await page.waitForTimeout(300);
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      viewport: document.documentElement.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  check(
    "dialog condiviso desktop: larghezza 960px proporzionata",
    geometry.width >= 880 && geometry.width <= 960,
    JSON.stringify(geometry),
  );
  check(
    "dialog condiviso desktop: nessun overflow orizzontale",
    geometry.scrollWidth <= geometry.clientWidth + 1,
    JSON.stringify(geometry),
  );
  await screenshotPainted(page, `${SHOT}/dialog-condiviso-1440.png`);
  await dialog.getByRole("button", { name: /Personale/ }).click();
}

try {
  const owner = await createFixtureUser("owner");
  const editor = await createFixtureUser("editor");
  const viewer = await createFixtureUser("viewer");
  const outsider = await createFixtureUser("outsider");
  await markDailyQuestionSeen(createdUserIds);
  await grantRequiredConsents(createdUserIds);
  await seedTaste(owner.id, { 28: 10, 18: 5 });
  await seedTaste(editor.id, { 35: 10, 18: 2 });
  await seedTaste(viewer.id, { 27: 10 });

  const sharedListId = randomUUID();
  const listInsert = await owner.client.from("title_lists").insert({
    id: sharedListId,
    owner_id: owner.id,
    name: `Gruppo suggerimenti ${Date.now()}`,
    description: "Fixture E2E temporanea",
    default_role: "viewer",
  });
  if (listInsert.error) throw listInsert.error;
  const membersInsert = await owner.client.from("title_list_members").insert([
    { list_id: sharedListId, user_id: owner.id, role: "owner" },
    { list_id: sharedListId, user_id: editor.id, role: "editor" },
    { list_id: sharedListId, user_id: viewer.id, role: "viewer" },
  ]);
  if (membersInsert.error) throw membersInsert.error;

  const ownerProfile = await rpcProfile(owner.client, sharedListId);
  const editorProfile = await rpcProfile(editor.client, sharedListId);
  check("RPC owner consentita", !ownerProfile.error, ownerProfile.error?.message);
  check("RPC editor consentita", !editorProfile.error, editorProfile.error?.message);
  check(
    "owner ed editor ricevono lo stesso profilo",
    sameJson(ownerProfile.data, editorProfile.data),
  );
  check(
    "il gruppo ha due contributori",
    ownerProfile.data?.contributorCount === 2,
    ownerProfile.data?.contributorCount,
  );
  const viewerDenied = await rpcProfile(viewer.client, sharedListId);
  const outsiderDenied = await rpcProfile(outsider.client, sharedListId);
  check(
    "viewer escluso dalla RPC",
    Boolean(viewerDenied.error),
    viewerDenied.error?.code,
  );
  check(
    "outsider escluso dalla RPC",
    Boolean(outsiderDenied.error),
    outsiderDenied.error?.code,
  );

  const initialVector = ownerProfile.data?.vector;
  await seedTaste(viewer.id, { 27: 1, 10749: 99 }, 70);
  const afterViewerTaste = await rpcProfile(owner.client, sharedListId);
  check(
    "il gusto del viewer non cambia il vettore",
    sameJson(initialVector, afterViewerTaste.data?.vector),
  );

  const demoted = await owner.client
    .from("title_list_members")
    .update({ role: "viewer" })
    .eq("list_id", sharedListId)
    .eq("user_id", editor.id);
  if (demoted.error) throw demoted.error;
  const afterDemotion = await rpcProfile(owner.client, sharedListId);
  check(
    "la demozione lascia un contributore",
    afterDemotion.data?.contributorCount === 1,
    afterDemotion.data?.contributorCount,
  );
  check(
    "la demozione aggiorna il vettore",
    !sameJson(initialVector, afterDemotion.data?.vector),
  );

  const restored = await owner.client
    .from("title_list_members")
    .update({ role: "editor" })
    .eq("list_id", sharedListId)
    .eq("user_id", editor.id);
  if (restored.error) throw restored.error;
  const optOut = await editor.client.from("user_preferences").upsert({
    user_id: editor.id,
    personalization_enabled: false,
    updated_at: new Date().toISOString(),
  });
  if (optOut.error) throw optOut.error;
  const afterOptOut = await rpcProfile(owner.client, sharedListId);
  check(
    "opt-out editor lascia un contributore",
    afterOptOut.data?.contributorCount === 1,
    afterOptOut.data?.contributorCount,
  );
  const optIn = await editor.client
    .from("user_preferences")
    .update({ personalization_enabled: true, updated_at: new Date().toISOString() })
    .eq("user_id", editor.id);
  if (optIn.error) throw optIn.error;
  const afterRestore = await rpcProfile(owner.client, sharedListId);
  check(
    "ripristino editor riporta due contributori",
    afterRestore.data?.contributorCount === 2 &&
      sameJson(initialVector, afterRestore.data?.vector),
    afterRestore.data?.contributorCount,
  );

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  });
  page = await context.newPage();
  page.on("pageerror", (error) =>
    runtimeErrors.push(`pageerror: ${String(error.stack ?? error.message)}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(
        `console: ${message.text()} @ ${message.location().url || "unknown"}`,
      );
    }
  });
  await login(page, owner);

  await page.goto(`${BASE}/lists`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Crea lista", exact: true }).first().click();
  await measureDialog(page, 1440, "dialog-personale-1440");
  await measureSharedDialog(page);
  await page.getByRole("button", { name: "Chiudi" }).click();

  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByRole("button", { name: "Crea lista", exact: true }).first().click();
  await measureDialog(page, 320, "dialog-personale-320");
  const personalName = `Lista personale ${Date.now()}`;
  await page.fill("#list-name", personalName);
  await page.fill("#list-description", "Creata dal banco dei suggerimenti.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea lista", exact: true })
    .click();
  await page.waitForURL(/\/lists\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
  const personalListUrl = page.url();
  const personalHeading = page.locator("#list-suggestions-title");
  await personalHeading.waitFor({ timeout: 60_000 });
  check("la lista personale apre i suggerimenti", await personalHeading.isVisible());
  const personalSection = page.locator(
    'section[aria-labelledby="list-suggestions-title"]',
  );
  const firstAdd = personalSection
    .getByRole("button", { name: "Aggiungi", exact: true })
    .first();
  await firstAdd.waitFor({ timeout: 60_000 });
  suggestionGridSeen = true;
  const suggestionCard = firstAdd.locator("..");
  const suggestionTitle = (
    (await suggestionCard
      .locator("a img")
      .first()
      .getAttribute("alt")
      .catch(() => null)) ??
    (await suggestionCard.locator("a p").first().innerText()).replace(
      /\s*·\s*\d{4}\s*$/,
      "",
    )
  ).trim();
  const suggestionHref = await suggestionCard.locator("a").first().getAttribute("href");
  if (!suggestionHref) throw new Error("Il primo suggerimento non ha un link al titolo.");
  await firstAdd.click();
  const itemsSection = page.locator('section[aria-labelledby="list-items-title"]');
  await itemsSection.locator("#list-items-title").waitFor({ timeout: 30_000 });
  const remove = itemsSection.getByRole("button", {
    name: `Rimuovi ${suggestionTitle}`,
    exact: true,
  });
  await remove.waitFor({ timeout: 30_000 });
  check("un suggerimento entra in Nella lista", await remove.isVisible());
  await remove.click();
  await remove.waitFor({ state: "detached", timeout: 30_000 });
  check("il titolo suggerito si può rimuovere", true);
  const addAgain = personalSection
    .locator(`a[href="${suggestionHref}"]`)
    .first()
    .locator('xpath=ancestor::div[.//button[normalize-space()="Aggiungi"]][1]')
    .getByRole("button", { name: "Aggiungi", exact: true });
  await addAgain.waitFor({ timeout: 30_000 });
  await addAgain.click();
  await remove.waitFor({ timeout: 30_000 });
  check("il titolo rimosso si può aggiungere di nuovo", await remove.isVisible());
  await screenshotPainted(page, `${SHOT}/personale-dettaglio-320.png`);

  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.goto(`${BASE}/lists/${sharedListId}`, { waitUntil: "domcontentloaded" });
    const sharedHeading = page.locator("#list-suggestions-title");
    await sharedHeading.waitFor({ timeout: 60_000 });
    const sharedAdd = page
      .locator('section[aria-labelledby="list-suggestions-title"]')
      .getByRole("button", { name: "Aggiungi", exact: true })
      .first();
    await sharedAdd.waitFor({ timeout: 60_000 });
    suggestionGridSeen = true;
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    check(
      `lista condivisa ${width}px: suggerimenti visibili`,
      await sharedHeading.isVisible(),
    );
    check(
      `lista condivisa ${width}px: nessun overflow orizzontale`,
      dimensions.scrollWidth <= dimensions.viewport + 1,
      JSON.stringify(dimensions),
    );
    await screenshotPainted(page, `${SHOT}/condivisa-${width}.png`);
  }

  check("la navigazione personale è rimasta valida", /\/lists\//.test(personalListUrl));
  await context.close();
} catch (error) {
  check("esecuzione completa", false, safeError(error));
  if (page) {
    await screenshotPainted(page, `${SHOT}/failure.png`).catch(() => {});
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const userId of createdUserIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error)
      check(`cleanup utente ${userId.slice(0, 8)}`, false, deleted.error.message);
  }
}

const excludedRuntimeErrors = suggestionGridSeen
  ? runtimeErrors.filter((message) => /image\.tmdb\.org|\/api\/tmdb\//i.test(message))
  : [];
const relevantRuntimeErrors = runtimeErrors.filter(
  (message) => !excludedRuntimeErrors.includes(message),
);
check(
  "nessun errore runtime rilevante",
  relevantRuntimeErrors.length === 0,
  relevantRuntimeErrors.slice(0, 3).join(" | "),
);

const report = {
  ok: checks.every((entry) => entry.ok),
  base: BASE,
  checks,
  runtimeErrors,
  excludedRuntimeErrors,
  notes,
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
