/**
 * Collaudo nel browser della **scala desktop**: da 1024px in su testi, locandine e
 * ritratti devono crescere insieme alla pagina, invece di restare alla misura del
 * telefono.
 *
 *   BASE=http://localhost:3402 node --env-file=.env.local scripts/desktop-scale-check.mjs
 *
 * Il difetto che questo script esiste per impedire non e' "un testo piccolo": e' che
 * una misura scritta a mano (13px, 96px, 150px) resti **identica** a 1024, 1280 e
 * 1920px mentre tutto il resto della pagina cresce. Per questo non misura un valore
 * assoluto ma due cose: che a 1024px si sia gia' oltre il minimo deciso, e che fra
 * 1024 e 1920 la misura **non scenda mai**.
 *
 * Valgono le trappole degli altri script del repo: il **service worker** va bloccato
 * (altrimenti arriva l'HTML di una build vecchia), la **domanda del giorno** va segnata
 * come gia' vista (il suo overlay copre la pagina) e il login vuole
 * `waitUntil: "domcontentloaded"`, perche' su questa app il `load` non arriva mai.
 *
 * L'utente finto si crea, si semina (titoli visti e votati, posizione a Milano per la
 * pagina Cinema) e si cancella da solo, anche quando una prova fallisce.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

/** Versioni correnti dei consensi obbligatori (`src/lib/legal/versions.ts`). */
const TERMS_VERSION = "2026-09-12";
const PRIVACY_VERSION = "2026-09-12";

const BASE = process.env.BASE ?? "http://localhost:3402";
const SHOT = "artifacts/desktop-scale";

/** Le larghezze che contano: l'attacco degli scalini `lg`/`xl`, piu' un monitor vero. */
const LARGHEZZE = [1024, 1280, 1920];

/**
 * Il minimo che ogni misura deve gia' avere a 1024px. Sono i valori decisi il
 * 2026-09-15 meno un pixel di arrotondamento: sotto, vuol dire che la pagina sta
 * ancora mostrando la misura del telefono.
 */
const MINIMI = {
  "testata di sezione": 23, // .section-heading: 20px sul telefono, 24 da lg
  "titolo sotto la locandina": 14, // PosterCard: 13 sul telefono
  "ritratto in Persone": 90, // ricerca: 64 sul telefono, 96 da lg
  "pillola della libreria": 14, // libreria: 13 sul telefono
  "locandina di una sala": 120, // cinema "Per cinema": 96 sul telefono
  "locandina dei voti piu' alti": 170, // profilo: 150 sul telefono
  "etichetta delle statistiche": 11, // profilo: 10 sul telefono
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Dsk!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.desktop.${Date.now()}@example.com`,
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

  // Libreria e profilo vuoti non hanno ne' griglia ne' scaffale dei voti: senza
  // semina questo script misurerebbe pagine di stati vuoti.
  const { data: titoli } = await admin
    .from("titles")
    .select("id, media_type")
    .not("poster_path", "is", null)
    .eq("media_type", "movie")
    .limit(14);
  const visti = (titoli ?? []).map((t, i) => ({
    user_id: id,
    title_id: t.id,
    media_type: t.media_type,
    status: "watched",
    rating: 10 - (i % 4),
    last_watched_at: new Date(Date.now() - i * 86_400_000).toISOString(),
    finished_at: new Date(Date.now() - i * 86_400_000).toISOString(),
  }));
  if (visti.length > 0) await admin.from("watch_entries").insert(visti);

  // Milano, cosi' la pagina Cinema ha una provincia e un programma da mostrare.
  await admin.from("user_locations").upsert({
    user_id: id,
    lat: 45.4642,
    lng: 9.19,
    label: "Milano, MI",
    province_slug: "milano",
  });

  return { id, email: data.user.email, titoli: titoli ?? [] };
}

const esiti = [];
const check = (nome, ok, dettaglio = "") =>
  esiti.push(`${ok ? "OK  " : "KO  "} ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);

/** Misure della pagina corrente: `null` quando quel pezzo non e' in pagina. */
function misuraPagina() {
  const px = (v) => (v == null ? null : Math.round(parseFloat(v) * 10) / 10);
  const font = (el) => (el ? px(getComputedStyle(el).fontSize) : null);
  const largo = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);

  // `.cv-auto` e' la radice di `PosterCard`: senza, in home il primo link a un
  // titolo e' il banner, e si misurerebbe il suo titolone.
  const caption = document.querySelector("main .cv-auto p");
  const ritratto = document.querySelector('main a[href^="/person/"] div');
  // le pillole della libreria (Tutto/Visti/…): il filtro e' nella query
  const pillola = document.querySelector('main a[href*="status="]');
  const salaPoster = document.querySelector("main [data-sala-poster]");
  const votoAlto = document.querySelector('main [data-top-rated] a[href^="/title/"]');
  const etichetta = document.querySelector("main dl dt");

  return {
    "testata di sezione": font(document.querySelector("main .section-heading")),
    "titolo sotto la locandina": font(caption),
    "ritratto in Persone": largo(ritratto),
    "pillola della libreria": font(pillola),
    "locandina di una sala": largo(salaPoster),
    "locandina dei voti piu' alti": largo(votoAlto),
    "etichetta delle statistiche": font(etichetta),
    scorre:
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
}

const me = await makeUser();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();

/** Tutte le misure di una pagina, a ogni larghezza. */
async function percorri(nome, percorso, attesa) {
  const viste = [];
  for (const w of LARGHEZZE) {
    await page.setViewportSize({ width: w, height: 950 });
    await page.goto(`${BASE}${percorso}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator(attesa).first().waitFor({ timeout: 30_000 });
      // il programma del cinema arriva in streaming dopo il primo chunk
      if (nome === "cinema") await page.waitForTimeout(6_000);
    } catch {
      esiti.push(`KO  ${nome}: a ${w}px non compare "${attesa}"`);
      continue;
    }
    // le griglie hanno `content-visibility: auto`: senza un istante di respiro le
    // misure arrivano da elementi non ancora disposti
    await page.waitForTimeout(250);
    viste.push({ w, ...(await page.evaluate(misuraPagina)) });
  }
  if (viste.length === 0) return;

  check(
    `${nome}: la pagina non scorre in orizzontale`,
    viste.every((v) => !v.scorre),
    viste
      .filter((v) => v.scorre)
      .map((v) => `${v.w}px`)
      .join(", ") || "nessuna larghezza",
  );

  for (const [misura, minimo] of Object.entries(MINIMI)) {
    const valori = viste.filter((v) => v[misura] != null);
    if (valori.length === 0) continue;
    const descrizione = valori.map((v) => `${v.w}px→${v[misura]}`).join("  ");
    check(
      `${nome}: ${misura} gia' desktop a 1024px (min ${minimo})`,
      valori.every((v) => v[misura] >= minimo),
      descrizione,
    );
    check(
      `${nome}: ${misura} non rimpicciolisce al crescere dello schermo`,
      valori.every((v, i) => i === 0 || v[misura] >= valori[i - 1][misura] - 0.6),
      descrizione,
    );
  }
  return viste;
}

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

  await percorri("home", "/", "main .section-heading");
  await percorri("ricerca", "/search?q=nolan", "main .cv-auto p");
  await percorri("libreria", "/library", 'main a[href*="status="]');
  await percorri("profilo", "/profile", "main dl dt");
  // La testata del Cinema sta nella `TopBar`, fuori da `main`: qui si aspetta la
  // pagina e basta, perche' il programma arriva in streaming e di notte puo' essere
  // vuoto (MyMovies pubblica l'indice di giorno). Se non ci sono sale, le misure
  // restano `null` e lo script lo dice invece di fallire.
  const cinema = await percorri("cinema", "/cinema?view=cinemas", "main");
  if (cinema && cinema.every((v) => v["locandina di una sala"] == null)) {
    esiti.push(
      "--  cinema: nessuna sala in programma adesso, la locandina non e' stata misurata",
    );
  }

  // Fotografie per l'occhio, alla larghezza piu' comune
  await page.setViewportSize({ width: 1440, height: 950 });
  for (const [nome, percorso] of [
    ["home", "/"],
    ["ricerca", "/search?q=nolan"],
    ["libreria", "/library"],
    ["profilo", "/profile"],
    ["cinema", "/cinema?view=cinemas"],
  ]) {
    await page.goto(`${BASE}${percorso}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOT}/${nome}-1440.png` });
  }
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
