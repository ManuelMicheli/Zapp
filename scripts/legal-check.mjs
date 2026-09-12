/**
 * Verifica end-to-end della conformità legale, contro un'istanza avviata.
 *
 *   NEXT_DIST_DIR=.next-legal pnpm build
 *   NEXT_DIST_DIR=.next-legal pnpm exec next start -p 3399
 *   BASE=http://localhost:3399 node --env-file=.env.local scripts/legal-check.mjs
 *
 * Crea un utente finto, entra dal form vero e lo cancella alla fine — se la
 * cancellazione dall'interfaccia fallisce, lo rimuove il blocco `finally`.
 *
 * Due trappole, entrambe già costate tempo altrove e da non ripetere:
 * - **il service worker**: in build di produzione Serwist ripresenta l'HTML di una
 *   build precedente e i click vanno a vuoto. Il contesto va aperto con
 *   `serviceWorkers: "block"`.
 * - **l'overlay della domanda del giorno**: si apre alla prima visita, sta sopra
 *   tutto e il suo tondo "Chiudi" non è cliccabile durante l'animazione. Si segna
 *   la domanda di oggi come già vista **prima** di aprire il browser.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3399";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Legal!${Date.now()}aA1`;

/**
 * Le tabelle che devono restare vuote dopo la cancellazione. È lo stesso inventario
 * dell'export (`src/app/api/account/export/route.ts`): chi ne aggiunge una lì la
 * aggiunge anche qui, altrimenti una tabella dimenticata non la nota nessuno.
 */
const TABELLE = [
  ["profiles", "id"],
  ["user_preferences", "user_id"],
  ["user_consents", "user_id"],
  ["watch_entries", "user_id"],
  ["episode_watches", "user_id"],
  ["reviews", "user_id"],
  ["review_comments", "user_id"],
  ["title_comments", "user_id"],
  ["title_lists", "owner_id"],
  ["user_seed_picks", "user_id"],
  ["user_taste", "user_id"],
  ["user_events", "user_id"],
  ["search_history", "user_id"],
  ["cinema_favorites", "user_id"],
  ["daily_answers", "user_id"],
  ["notifications", "user_id"],
  ["watch_sessions", "user_id"],
  ["device_members", "user_id"],
];

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

/** Utente appena creato: onboarding **non** completato e nessun consenso. */
async function creaUtente() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.legal.${Date.now()}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;

  const { data: oggi } = await admin
    .from("daily_questions")
    .select("ask_on")
    .lte("ask_on", new Date().toISOString().slice(0, 10))
    .order("ask_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (oggi) {
    await admin.from("daily_question_views").insert({ user_id: id, ask_on: oggi.ask_on });
  }
  return { id, email: data.user.email };
}

const utente = await creaUtente();
let cancellatoDaInterfaccia = false;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
const page = await context.newPage();

try {
  // --- 1. i tre documenti rispondono da sloggati ---
  for (const rotta of ["/privacy", "/termini", "/licenze"]) {
    const risposta = await page.request.get(`${BASE}${rotta}`);
    check(`${rotta} da sloggati`, risposta.status() === 200, `HTTP ${risposta.status()}`);
  }

  // --- 2. il passo 0 dell'onboarding: i documenti prima di tutto ---
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', utente.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL(/\/onboarding/, { timeout: 30000 });

  const continua = page.getByRole("button", { name: "Continua" });
  check(
    "passo 0: bottone disabilitato con la casella vuota",
    await continua.isDisabled(),
  );

  await page.locator('input[type="checkbox"]').check();
  check("passo 0: bottone attivo dopo la spunta", await continua.isEnabled());
  await continua.click();

  await page.locator("#username").waitFor({ timeout: 30000 });
  check("passo 1 raggiunto dopo l'accettazione", true);

  const { data: righe } = await admin
    .from("user_consents")
    .select("kind, version, revoked_at")
    .eq("user_id", utente.id);
  const attivi = (righe ?? []).filter((r) => r.revoked_at === null).map((r) => r.kind);
  check(
    "due consensi obbligatori registrati",
    attivi.includes("terms") && attivi.includes("privacy"),
    attivi.join(", ") || "nessuno",
  );

  // --- 3. età minima: 14 anni ---
  const nome = `legal${Date.now()}`.slice(0, 18);
  await page.fill("#username", nome);
  await page.fill("#birth_year", String(new Date().getFullYear() - 10));
  await page.getByRole("button", { name: /Continua|Inizia a usare Zapp/ }).click();
  await page.waitForTimeout(500);
  check(
    "anno che dà meno di 14 anni: rifiutato",
    (await page.getByText(/almeno 14 anni/).count()) > 0,
  );

  await page.fill("#birth_year", String(new Date().getFullYear() - 30));
  // Con la griglia dei titoli il passo 1 ha "Continua" e solo il passo 2 invia:
  // senza candidati (classifiche giù) il primo bottone invia già. Si preme finché
  // si esce dall'onboarding, al massimo due volte.
  for (let i = 0; i < 2 && /\/onboarding/.test(page.url()); i++) {
    await page.getByRole("button", { name: /Continua|Inizia a usare Zapp/ }).click();
    await page
      .waitForURL((u) => !u.pathname.startsWith("/onboarding"), { timeout: 15000 })
      .catch(() => {});
  }
  check(
    "onboarding completato con un anno valido",
    !/\/onboarding/.test(page.url()),
    page.url(),
  );

  // --- 4. export dei dati ---
  const primo = await page.request.get(`${BASE}/api/account/export`);
  const corpo = primo.status() === 200 ? await primo.json() : null;
  check(
    "export: 200 con allegato",
    primo.status() === 200 &&
      (primo.headers()["content-disposition"] ?? "").includes("attachment"),
    `HTTP ${primo.status()}`,
  );
  check(
    "export: contiene i propri consensi",
    Array.isArray(corpo?.dati?.user_consents) && corpo.dati.user_consents.length >= 2,
    `${corpo?.dati?.user_consents?.length ?? 0} righe`,
  );
  const secondo = await page.request.get(`${BASE}/api/account/export`);
  check(
    "export: la seconda chiamata è limitata",
    secondo.status() === 429,
    `HTTP ${secondo.status()}`,
  );

  // --- 5. cancellazione dal profilo ---
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Elimina l/ }).click();
  await page.getByLabel("Nome utente di conferma").fill(nome);
  await page.getByRole("button", { name: "Elimina definitivamente" }).click();
  await page.waitForURL(/\/addio/, { timeout: 30000 });
  cancellatoDaInterfaccia = true;
  check("cancellazione: si atterra su /addio", true);

  for (const [tabella, colonna] of TABELLE) {
    const { count, error } = await admin
      .from(tabella)
      .select(colonna, { count: "exact", head: true })
      .eq(colonna, utente.id);
    check(
      `${tabella}: nessuna riga residua`,
      !error && (count ?? 0) === 0,
      error ? error.message : `count=${count}`,
    );
  }

  const { data: files } = await admin.storage.from("tickets").list(utente.id);
  check("bucket tickets: nessun file residuo", (files ?? []).length === 0);
} catch (e) {
  // Senza questo, un timeout fa esplodere lo script prima di stampare cosa era
  // andato bene: e la riga che serve è proprio l'ultima passata.
  check("esecuzione interrotta", false, String(e).slice(0, 120));
} finally {
  await browser.close();
  if (!cancellatoDaInterfaccia) {
    await admin.auth.admin.deleteUser(utente.id).catch(() => {});
  }
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
