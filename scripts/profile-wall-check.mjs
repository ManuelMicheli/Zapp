/**
 * Collaudo del muro di locandine del profilo: che si veda **tutto insieme** invece
 * che a pezzi, che il telefono non scarichi anche le locandine del muro da desktop,
 * e che da `md` in su la parete si fermi dietro l'immagine profilo. L'ultima prova e'
 * sul **profilo di un altro** (`/u/…`): sul telefono la parete deve scendere come sul
 * proprio, e per vederlo servono due utenti finti gia' amici.
 *
 *   BASE=http://localhost:3399 node --env-file=.env.local scripts/profile-wall-check.mjs
 *
 * Le trappole di `people-ui-check.mjs` valgono identiche: **service worker bloccato**
 * (altrimenti arriva l'HTML di una build vecchia) e **domanda del giorno** segnata come
 * gia' vista, o il suo overlay copre la pagina. Crea un utente finto, entra dal form
 * vero e lo cancella alla fine, anche se una prova fallisce.
 *
 * Due trappole di misura, costate un giro a vuoto il 2026-09-15:
 * - il muro sta dentro una scena in prospettiva, quindi il `getBoundingClientRect()` di
 *   una tessera dice numeri enormi (58.000 px) che non c'entrano con cio' che si vede:
 *   dove arriva la parete si misura sul **riquadro che la ritaglia**
 *   (`[data-profile-wall]`, `overflow-hidden`), non sulle tessere;
 * - le tessere di `instant` sono `background-image`, non `<img>`: "sono arrivate tutte"
 *   si controlla confrontando le URL citate nel DOM con quelle tornate 200 dalla rete.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const TERMS_VERSION = "2026-09-12";
const PRIVACY_VERSION = "2026-09-12";

const BASE = process.env.BASE ?? "http://localhost:3399";
const SHOT = process.env.SHOT ?? ".shots";
mkdirSync(SHOT, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Wal!${Date.now()}aA1`;

async function makeUser(username) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.profile-wall.${Date.now()}.${username}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin
    .from("profiles")
    .update({ username, onboarding_completed_at: new Date().toISOString() })
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
  return { id, username, email: data.user.email };
}

/** Amicizia accettata fra i due utenti finti: senza, /u/… non mostra il percorso. */
async function makeFriends(a, b) {
  const { error } = await admin
    .from("friendships")
    .insert({ requester_id: a, addressee_id: b, status: "accepted" });
  if (error) throw error;
}

const esiti = [];
const check = (nome, ok, dettaglio = "") =>
  esiti.push(`${ok ? "OK  " : "KO  "} ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);

/** Locandine citate dalle tessere che si vedono davvero, e dove arriva la parete. */
function misuraMuro() {
  const dentro = (el) => {
    let n = el;
    while (n instanceof Element) {
      if (getComputedStyle(n).display === "none") return false;
      n = n.parentElement;
    }
    return true;
  };
  const tessere = [...document.querySelectorAll(".wall-col > *")];
  const citate = new Set();
  const soloNascoste = new Set();
  let visibili = 0;
  for (const el of tessere) {
    const src =
      el.getAttribute("src") ??
      (getComputedStyle(el).backgroundImage.match(/url\("?(.+?)"?\)/)?.[1] || null);
    if (!src) continue;
    if (dentro(el)) {
      visibili += 1;
      citate.add(src);
    } else {
      soloNascoste.add(src);
    }
  }
  // i due muri pescano dalla stessa lista: sono "solo del muro nascosto" le locandine
  // che nessuna tessera visibile cita
  for (const src of citate) soloNascoste.delete(src);
  const riquadro = document.querySelector("[data-profile-wall]");
  const journey = document.querySelector("[data-profile-journey-region]");
  const header = document.querySelector("header");
  return {
    tessere: tessere.length,
    visibili,
    citate: [...citate],
    soloNascoste: [...soloNascoste],
    fondoParete: riquadro ? riquadro.getBoundingClientRect().bottom : null,
    fondoTestata: header ? header.getBoundingClientRect().bottom : null,
    journeyTop: journey ? journey.getBoundingClientRect().top : null,
    preload: document.querySelectorAll('link[rel="preload"][as="image"]').length,
    preloadHref: [...document.querySelectorAll('link[rel="preload"][as="image"]')].map(
      (l) => l.getAttribute("href") ?? l.getAttribute("imagesrcset") ?? "",
    ),
  };
}

const me = await makeUser(`wall${Date.now().toString(36)}`);
const amico = await makeUser(`wallamico${Date.now().toString(36)}`);
const browser = await chromium.launch();
const erroriConsole = [];

/**
 * Entra come `chi` e apre `path` in un contesto nuovo; raccoglie le locandine
 * chieste in rete. Per difetto: l'utente finto sul proprio profilo.
 */
async function apriProfilo(viewport, { chi = me, path = "/profile" } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && erroriConsole.push(m.text()));
  page.on("pageerror", (e) => erroriConsole.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', chi.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });

  const chieste = new Set();
  const arrivate = new Set();
  page.on("request", (r) => {
    if (r.url().includes("image.tmdb.org/t/p/")) chieste.add(r.url());
  });
  page.on("response", (r) => {
    if (r.url().includes("image.tmdb.org/t/p/") && r.status() === 200)
      arrivate.add(r.url());
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  // il profilo non ha un h1: si aspetta il percorso cinefilo, l'ultima cosa della testata
  await page
    .locator("[data-profile-journey-region]")
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  return { context, page, chieste, arrivate };
}

/**
 * Le prove comuni ai due formati. Il conto delle richieste si fa **solo** sulle
 * locandine del muro: /profile ne carica molte altre di suo (voti piu' alti, ritratti,
 * amici), che non c'entrano.
 */
function proveComuni(etichetta, misura, rete) {
  const mancanti = misura.citate.filter((u) => !rete.arrivate.has(u));
  check(
    `${etichetta}: tutte le locandine del muro sono arrivate`,
    misura.visibili > 0 && misura.citate.length > 0 && mancanti.length === 0,
    `${misura.visibili} tessere visibili su ${misura.tessere}, ${misura.citate.length} locandine diverse, ${mancanti.length} non arrivate`,
  );
  const scaricateInutili = misura.soloNascoste.filter((u) => rete.chieste.has(u));
  check(
    `${etichetta}: non scarica le locandine del muro nascosto`,
    scaricateInutili.length === 0,
    `${misura.soloNascoste.length} locandine solo del muro nascosto, ${scaricateInutili.length} scaricate lo stesso`,
  );
  const preloadDelMuro = misura.preloadHref.filter(
    (h) => misura.citate.includes(h) || misura.soloNascoste.includes(h),
  );
  check(
    `${etichetta}: il muro non emette <link rel=preload as=image>`,
    preloadDelMuro.length === 0,
    `${preloadDelMuro.length} preload di locandine del muro (in pagina ce ne sono ${misura.preload}, di altre sezioni)`,
  );
}

try {
  // 1. telefono: il muro arriva tutto insieme e resta suo ----------------------
  const tel = await apriProfilo({ width: 390, height: 844 });
  const mobile = await tel.page.evaluate(misuraMuro);
  proveComuni("telefono", mobile, tel);
  check(
    "telefono: la parete prosegue oltre l'inizio del percorso cinefilo",
    mobile.journeyTop !== null && mobile.fondoParete > mobile.journeyTop,
    `parete fino a ${Math.round(mobile.fondoParete)}px, percorso da ${Math.round(mobile.journeyTop)}px`,
  );
  await tel.page.screenshot({ path: `${SHOT}/profilo-muro-telefono.png` });
  await tel.context.close();

  // 2. desktop: la parete si ferma dietro l'immagine profilo -------------------
  const pc = await apriProfilo({ width: 1440, height: 900 });
  const desktop = await pc.page.evaluate(misuraMuro);
  proveComuni("desktop", desktop, pc);
  check(
    "desktop: la parete finisce con la testata",
    desktop.fondoTestata !== null &&
      Math.abs(desktop.fondoParete - desktop.fondoTestata) <= 2,
    `parete fino a ${Math.round(desktop.fondoParete)}px, testata fino a ${Math.round(desktop.fondoTestata)}px`,
  );
  check(
    "desktop: niente locandine dietro il percorso cinefilo",
    desktop.journeyTop !== null && desktop.fondoParete <= desktop.journeyTop,
    `percorso da ${Math.round(desktop.journeyTop)}px`,
  );
  await pc.page.screenshot({ path: `${SHOT}/profilo-muro-desktop.png` });
  await pc.context.close();

  // 3. profilo altrui: sul telefono la parete scende come sul proprio ---------
  // Serve l'amicizia accettata: i conteggi del percorso cinefilo passano dalle
  // policy di `watch_entries`, che li mostrano solo agli amici.
  await makeFriends(amico.id, me.id);
  const altrui = await apriProfilo(
    { width: 390, height: 844 },
    { chi: amico, path: `/u/${me.username}` },
  );
  const visto = await altrui.page.evaluate(misuraMuro);
  proveComuni("profilo altrui", visto, altrui);
  check(
    "profilo altrui: la parete prosegue oltre l'inizio del percorso cinefilo",
    visto.journeyTop !== null && visto.fondoParete > visto.journeyTop,
    `parete fino a ${Math.round(visto.fondoParete)}px, percorso da ${Math.round(visto.journeyTop ?? NaN)}px`,
  );
  check(
    "profilo altrui: la parete scende quanto sul proprio",
    visto.fondoParete !== null &&
      mobile.fondoParete !== null &&
      Math.abs(visto.fondoParete - mobile.fondoParete) <= 80,
    `altrui ${Math.round(visto.fondoParete)}px, proprio ${Math.round(mobile.fondoParete)}px`,
  );
  await altrui.page.screenshot({ path: `${SHOT}/profilo-altrui-muro-telefono.png` });
  await altrui.context.close();
} catch (e) {
  esiti.push(`KO  eccezione — ${e.message ?? e}`);
} finally {
  await browser.close();
  for (const u of [me, amico]) {
    const { error: delError } = await admin.auth.admin.deleteUser(u.id);
    if (delError) {
      console.error(
        `ATTENZIONE: pulizia dell'utente finto ${u.id} fallita — ${delError.message}`,
      );
    }
  }
  console.log(esiti.join("\n"));
  const fallito = esiti.some((r) => r.startsWith("KO"));
  if (fallito && erroriConsole.length > 0) {
    console.log("\n--- console/pageerror del browser (diagnosi) ---");
    console.log(erroriConsole.join("\n"));
  }
  if (fallito) process.exitCode = 1;
}
