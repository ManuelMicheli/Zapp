/**
 * Collaudo nel browser della sezione Corti (`/corti`, `/corti/[slug]`).
 *
 *   BASE=http://localhost:3405 node --env-file=.env.local scripts/corti-check.mjs
 *
 * Prova le quattro cose che possono rompersi senza che nessun test le veda:
 * che la griglia disegni tutte le card, che le **copertine di YouTube arrivino
 * davvero** (la CSP e' il punto dove si rompono: `i.ytimg.com` deve stare in
 * `img-src`), che il player parta solo dopo il tocco (prima non deve esistere
 * nessun iframe) e che "visto"/"preferito" scrivano e tornino indietro.
 *
 * Valgono le trappole degli altri script del repo: il **service worker** va bloccato
 * (altrimenti arriva l'HTML di una build vecchia), la **domanda del giorno** va
 * segnata come gia' vista (il suo overlay copre la pagina) e il login vuole
 * `waitUntil: "domcontentloaded"`, perche' su questa app il `load` non arriva mai.
 *
 * L'utente finto si crea e si cancella da solo, anche quando una prova fallisce.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

/** Versioni correnti dei consensi obbligatori (`src/lib/legal/versions.ts`). */
const TERMS_VERSION = "2026-09-12";
const PRIVACY_VERSION = "2026-09-12";

const BASE = process.env.BASE ?? "http://localhost:3405";
const SHOT = "artifacts/corti";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Cor!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.corti.${Date.now()}@example.com`,
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
    await admin
      .from("daily_question_views")
      .insert({ user_id: id, ask_on: today.ask_on });
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
  viewport: { width: 1440, height: 950 },
  serviceWorkers: "block",
});
const page = await context.newPage();

/** Le copertine che il browser ha davvero scaricato da YouTube. */
const copertine = { ok: 0, ko: [] };
page.on("response", (res) => {
  if (!res.url().startsWith("https://i.ytimg.com/")) return;
  if (res.status() < 400) copertine.ok += 1;
  else copertine.ko.push(`${res.status()} ${res.url()}`);
});
const violazioniCsp = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/Content Security Policy/i.test(t)) violazioniCsp.push(t.slice(0, 160));
});

try {
  mkdirSync(SHOT, { recursive: true });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', me.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });

  // ---- la griglia ----------------------------------------------------------
  await page.goto(`${BASE}/corti`, { waitUntil: "domcontentloaded" });
  await page.locator('main a[href^="/corti/"]').first().waitFor({ timeout: 30_000 });
  // `content-visibility: auto` non disegna le card fuori schermo: per contarle
  // davvero bisogna scorrere fino in fondo. Con quattrocento card la pagina e' lunga,
  // quindi il passo e' grande e la pausa breve.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 1400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  const attesi = JSON.parse(readFileSync("src/data/short-films.json", "utf8")).corti
    .length;
  const card = await page.locator('main a[href^="/corti/"]').count();
  check(
    "la griglia mostra tutti i corti del catalogo",
    card >= attesi,
    `${card} link su ${attesi} attesi`,
  );
  check(
    "le copertine di YouTube arrivano (CSP img-src)",
    copertine.ok > 50 && copertine.ko.length === 0,
    `${copertine.ok} scaricate, ${copertine.ko.length} fallite`,
  );
  check("nessuna violazione di CSP", violazioniCsp.length === 0, violazioniCsp[0] ?? "");
  await page.screenshot({ path: `${SHOT}/corti-1440.png`, fullPage: false });
  // La griglia vera sta sotto la card di copertina: una fotografia a scroll zero
  // mostrerebbe solo quella.
  await page.evaluate(() => window.scrollTo(0, 980));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/corti-griglia.png` });
  // La barra dei filtri deve **coprire** le card che le passano sotto: il punto
  // esatto al centro della prima pillola deve appartenere alla barra, non a una card.
  const barra = await page.evaluate(() => {
    const pill = document.querySelector("main button[aria-pressed]");
    const sticky = pill?.closest("[class*='sticky']");
    if (!sticky) return { errore: "barra non trovata" };
    const r = sticky.getBoundingClientRect();
    const sopra = document.elementFromPoint(r.left + r.width - 24, r.top + 6);
    return {
      altezza: Math.round(r.height),
      fondo: getComputedStyle(sticky.firstElementChild).backgroundColor,
      copre: Boolean(sopra && sticky.contains(sopra)),
      sopra: sopra?.className?.toString?.().slice(0, 60) ?? "",
    };
  });
  check(
    "la barra dei filtri copre le card che le scorrono sotto",
    barra.copre === true,
    `${barra.errore ?? ""} fondo=${barra.fondo} sopra=${barra.sopra}`,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  // ---- i filtri ------------------------------------------------------------
  const prima = await page.locator('main a[href^="/corti/"]').count();
  await page.getByRole("button", { name: "Italiano" }).click();
  await page.waitForTimeout(600);
  const dopo = await page.locator('main a[href^="/corti/"]').count();
  check(
    "il filtro Italiano restringe la lista",
    dopo > 0 && dopo < prima,
    `${prima} → ${dopo}`,
  );
  await page.screenshot({ path: `${SHOT}/corti-filtro-italiano.png` });
  await page.getByRole("button", { name: "Tutte le lingue" }).click();
  await page.waitForTimeout(400);

  // ---- la scheda del corto -------------------------------------------------
  await page.goto(`${BASE}/corti/hair-love`, { waitUntil: "domcontentloaded" });
  await page.locator("main h1").first().waitFor({ timeout: 30_000 });
  const titolo = await page.locator("main h1").first().innerText();
  const corpo = await page.locator("main").innerText();
  check(
    "la scheda ha il titolo giusto",
    titolo.includes("Hair Love"),
    `h1 = ${JSON.stringify(titolo)}`,
  );
  check("la scheda mostra la trama in italiano", corpo.includes("capelli della figlia"));
  check("la scheda mostra il riconoscimento", corpo.includes("Oscar 2020"));
  check(
    "prima del tocco non c'e' nessun iframe di YouTube",
    (await page.locator("iframe").count()) === 0,
  );

  await page.getByRole("button", { name: /Riproduci/i }).click();
  await page.waitForTimeout(2500);
  const frame = page.locator('iframe[src*="youtube-nocookie.com"]');
  check("il player parte dopo il tocco", (await frame.count()) === 1);
  check(
    "l'iframe ha davvero un riquadro (non e' alto zero)",
    (await frame.first().boundingBox())?.height > 200,
  );
  check(
    "nessuna violazione di CSP nemmeno col player acceso",
    violazioniCsp.length === 0,
    violazioniCsp[0] ?? "",
  );
  await page.screenshot({ path: `${SHOT}/corto-player.png` });

  // ---- visto e preferito ---------------------------------------------------
  await page.getByRole("button", { name: "Segna visto" }).click();
  await page.waitForTimeout(2500);
  const rigaVisto = await admin
    .from("short_film_entries")
    .select("watched_at, favorite")
    .eq("user_id", me.id)
    .eq("short_id", "kNw8V_Fkw28")
    .maybeSingle();
  check("«Segna visto» scrive la riga", Boolean(rigaVisto.data?.watched_at));

  await page.getByRole("button", { name: "Preferito" }).click();
  await page.waitForTimeout(2500);
  const rigaPref = await admin
    .from("short_film_entries")
    .select("watched_at, favorite")
    .eq("user_id", me.id)
    .eq("short_id", "kNw8V_Fkw28")
    .maybeSingle();
  check("«Preferito» scrive sulla stessa riga", rigaPref.data?.favorite === true);

  await page.getByRole("button", { name: "Visto" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Nei preferiti" }).click();
  await page.waitForTimeout(2500);
  const rimasta = await admin
    .from("short_film_entries")
    .select("short_id")
    .eq("user_id", me.id)
    .eq("short_id", "kNw8V_Fkw28")
    .maybeSingle();
  check(
    "spegnendo entrambi la riga sparisce (vincolo short_film_entries_non_vuota)",
    !rimasta.data,
  );

  // ---- lo scaffale in home -------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator('main a[href^="/corti/"]').first().waitFor({ timeout: 45_000 });
  const scaffale = await page.locator('main a[href^="/corti/"]').count();
  check("la home ha lo scaffale dei corti", scaffale >= 8, `${scaffale} card`);
  await page.locator('main a[href^="/corti/"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT}/home-scaffale.png` });

  // ---- telefono ------------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/corti`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const scorre = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check("a 390px la pagina non scorre in orizzontale", !scorre);
  await page.screenshot({ path: `${SHOT}/corti-390.png` });
  await page.goto(`${BASE}/corti/hair-love`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/corto-390.png` });
} catch (e) {
  esiti.push(`KO  eccezione — ${e.message ?? e}`);
} finally {
  await browser.close();
  await admin.from("short_film_entries").delete().eq("user_id", me.id);
  const { error: delError } = await admin.auth.admin.deleteUser(me.id);
  if (delError) {
    console.error(
      `ATTENZIONE: pulizia dell'utente finto ${me.id} fallita — ${delError.message}`,
    );
  }
  console.log(esiti.join("\n"));
  console.log(`\nFotografie in ${SHOT}/`);
  if (esiti.some((r) => r.startsWith("KO"))) process.exitCode = 1;
}
