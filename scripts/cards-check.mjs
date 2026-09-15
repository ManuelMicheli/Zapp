/**
 * Collaudo nel browser della misura delle locandine nelle **griglie** su desktop.
 *
 *   BASE=http://localhost:3399 node --env-file=.env.local scripts/cards-check.mjs
 *
 * Non misura un pixel per curiosita': il difetto che questo script esiste per
 * impedire e' che la card **rimpicciolisca mentre lo schermo cresce**. Con le colonne
 * fisse succedeva davvero — 6 colonne a 1024px davano 144px, 8 a 1280px ne davano 136,
 * 10 a 1536px ne davano 131 — e nessuno se ne accorgeva guardando una sola larghezza.
 *
 * La prova non e' pero' la monotonia stretta: `auto-fill` ha per costruzione un dente
 * di sega, perche' quando la larghezza basta per una colonna in piu' la card torna al
 * minimo (misurato: 194px a 1536, 190px a 1920 — quattro pixel, il 2%). Cio' che deve
 * valere e' che ci sia un **pavimento**: la card non scende mai sotto MIN e un calo fra
 * due larghezze non supera un dente, cioe' ~un gap. Il vecchio difetto sfondava
 * entrambe le regole. Le altre due prove: la fascia (MIN-MAX) e nessuno scorrimento
 * orizzontale a nessuna larghezza.
 *
 * Valgono le due trappole di `people-ui-check.mjs`: il **service worker** va bloccato
 * (altrimenti arriva l'HTML di una build vecchia) e la **domanda del giorno** va
 * segnata come gia' vista, o il suo overlay copre la pagina. L'utente finto si crea e
 * si cancella da solo, anche se una prova fallisce.
 *
 * Le pagine provate (persona, genere, ricerca) sono tre delle sei che condividono
 * `POSTER_GRID_DESKTOP`: bastano perche' la misura viene da quella costante sola. Si
 * scelgono queste tre perche' si riempiono da TMDB e non serve seminare la libreria
 * dell'utente finto.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

/** Versioni correnti dei consensi obbligatori (`src/lib/legal/versions.ts`). */
const TERMS_VERSION = "2026-09-12";
const PRIVACY_VERSION = "2026-09-12";

const BASE = process.env.BASE ?? "http://localhost:3399";

/** Le larghezze che contano: l'attacco di ogni scalino di Tailwind, piu' un monitor vero. */
const LARGHEZZE = [1024, 1280, 1536, 1920];

/** La fascia decisa il 2026-09-15: ~173-195px, con un dito di margine per gli arrotondamenti. */
const MIN = 165;
const MAX = 205;

/**
 * Il dente di sega ammesso quando entra una colonna in piu': un gap della griglia
 * (16-20px) piu' gli arrotondamenti. Oltre, non e' piu' un dente — e' il difetto.
 */
const DENTE = 24;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Crd!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.cards.${Date.now()}@example.com`,
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
  if (today) {
    await admin.from("daily_question_views").insert({ user_id: id, ask_on: today.ask_on });
  }
  const now = new Date().toISOString();
  await admin.from("user_consents").insert([
    { user_id: id, kind: "terms", version: TERMS_VERSION, granted_at: now },
    { user_id: id, kind: "privacy", version: PRIVACY_VERSION, granted_at: now },
  ]);
  return { id, email: data.user.email };
}

const esiti = [];
const check = (nome, ok, dettaglio = "") =>
  esiti.push(`${ok ? "OK  " : "KO  "} ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);

const me = await makeUser();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();

/**
 * La larghezza della **copertina**, non della card: si misura il riquadro `aspect-[2/3]`
 * dentro il primo link a un titolo dentro `main`. Misurare il link prenderebbe anche il
 * testo sotto, che va a capo e falserebbe il conto.
 */
async function larghezzaLocandina() {
  return page.evaluate(() => {
    const link = document.querySelector('main a[href^="/title/"]');
    const box = link?.querySelector("div > div");
    if (!box) return null;
    return Math.round(box.getBoundingClientRect().width);
  });
}

async function scorreInOrizzontale() {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function misura(nome, percorso) {
  const viste = [];
  for (const w of LARGHEZZE) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}${percorso}`, { waitUntil: "domcontentloaded" });
    await page.locator('main a[href^="/title/"]').first().waitFor({ timeout: 30_000 });
    const larghezza = await larghezzaLocandina();
    const scorre = await scorreInOrizzontale();
    viste.push({ w, larghezza, scorre });
  }
  const descrizione = viste.map((v) => `${v.w}px→${v.larghezza}px`).join("  ");

  check(
    `${nome}: al crescere dello schermo la locandina non crolla (max ${DENTE}px di dente)`,
    viste.every((v, i) => i === 0 || v.larghezza >= viste[i - 1].larghezza - DENTE),
    descrizione,
  );
  check(
    `${nome}: la locandina sta fra ${MIN} e ${MAX}px a ogni larghezza`,
    viste.every((v) => v.larghezza >= MIN && v.larghezza <= MAX),
    descrizione,
  );
  check(
    `${nome}: la pagina non scorre in orizzontale`,
    viste.every((v) => !v.scorre),
    viste
      .filter((v) => v.scorre)
      .map((v) => `${v.w}px`)
      .join(", ") || "nessuna larghezza",
  );
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', me.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  // `waitUntil` di default e' "load", che su questa app non arriva mai (il service
  // worker e' bloccato e la pagina resta in streaming): serve "domcontentloaded".
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });

  // Christopher Nolan (525): filmografia lunga, sempre piena.
  await misura("filmografia", "/person/525");
  await misura("genere", "/discover/movie/classici");
  await misura("ricerca", "/search?q=matrix");
} catch (e) {
  esiti.push(`KO  eccezione — ${e.message ?? e}`);
} finally {
  await browser.close();
  const { error: delError } = await admin.auth.admin.deleteUser(me.id);
  if (delError) {
    console.error(
      `ATTENZIONE: pulizia dell'utente finto ${me.id} fallita — ${delError.message}`,
    );
  }
  console.log(esiti.join("\n"));
  if (esiti.some((r) => r.startsWith("KO"))) process.exitCode = 1;
}
