/**
 * Collaudo nel browser di "attori e registi preferiti": dal cast di un titolo alla
 * pagina della persona, il cuore che si accende e si salva davvero (sopravvive al
 * reload — nessuno l'aveva ancora provato), lo scaffale sul profilo, la riga
 * "Persone" nella ricerca, e la controprova che il merge con un'altra sessione non ha
 * rotto il personaggio preferito (funzione diversa, sullo stesso titolo).
 *
 *   BASE=http://localhost:3399 node --env-file=.env.local scripts/people-ui-check.mjs
 *
 * Usa una serie (Stranger Things, id 66732, gia' nota a `nav-check.mjs`) per **tutte**
 * le prove, cast compreso, invece di un film: il "personaggio preferito" vive solo
 * sulle serie (i ritratti vengono da TVmaze, niente film — vedi
 * `FavoriteCharacterSection`), quindi su un film la prova 6 non avrebbe nulla da
 * verificare. Link persona, cuore e ricerca sono lo stesso componente sia per film sia
 * per serie: nessuna copertura persa nello scambio.
 *
 * Le due trappole di `genre-check.mjs`/`nav-check.mjs` valgono identiche: il
 * **service worker** va bloccato (altrimenti arriva l'HTML di una build vecchia) e la
 * **domanda del giorno** va segnata come gia' vista, o il suo overlay copre la pagina.
 * Crea un utente finto, entra dal form vero e lo cancella alla fine, anche se una
 * prova fallisce.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

/**
 * Versioni correnti dei consensi obbligatori (`src/lib/legal/versions.ts`, `VERSIONI`):
 * senza una riga attiva in `user_consents` per ciascuno, il gate del layout `(app)`
 * blocca tutto dietro "Abbiamo aggiornato i documenti" e nessuna pagina si vede.
 */
const TERMS_VERSION = "2026-09-12";
const PRIVACY_VERSION = "2026-09-12";

const BASE = process.env.BASE ?? "http://localhost:3399";
const SHOT = process.env.SHOT ?? ".shots";
mkdirSync(SHOT, { recursive: true });

/** Serie con un cast ampio e noto: Stranger Things. */
const TV_ID = 66732;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Ppl!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.people-ui.${Date.now()}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", id);
  // l'overlay della domanda del giorno copre tutto (z-60): segnarla come gia' vista
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
// 400px: la larghezza minima da cui la pagina persona non deve scorrere in orizzontale.
const context = await browser.newContext({
  viewport: { width: 400, height: 844 },
  serviceWorkers: "block",
});
const page = await context.newPage();

const erroriConsole = [];
page.on("console", (m) => m.type() === "error" && erroriConsole.push(m.text()));
page.on("pageerror", (e) => erroriConsole.push(`pageerror: ${e.message}`));
// i prefetch RSC di Next (`?_rsc=`) e i player embed (YouTube/Google) si annullano di
// continuo durante la navigazione: rumore normale, non un guasto dell'app.
page.on("requestfailed", (r) => {
  if (/[?&]_rsc=/.test(r.url())) return;
  if (/youtube-nocookie\.com|googlevideo\.com|\bgoogle\.com\//.test(r.url())) return;
  erroriConsole.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`);
});

let personId = null;

/**
 * Aspetta che il cuore mostri `target` ("true"/"false") E che non sia più "pending"
 * (niente `opacity-70`, la classe che `FavoritePersonButton` mette durante la
 * `useTransition`): l'aggiornamento ottimistico accende il cuore all'istante, prima
 * ancora che `togglePreferito` abbia scritto su Supabase, quindi controllare solo
 * `aria-pressed` subito dopo il click prende la cosa sbagliata — bisogna aspettare
 * che la Server Action sia davvero tornata prima di ricaricare la pagina.
 */
async function aspettaCuore(target) {
  await page.waitForFunction(
    (t) => {
      const b = document.querySelector("main button[aria-pressed]");
      return b?.getAttribute("aria-pressed") === t && !b.className.includes("opacity-70");
    },
    target,
    { timeout: 15_000 },
  );
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', me.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

  // 1. dal cast alla persona -------------------------------------------------
  await page.goto(`${BASE}/title/tv/${TV_ID}`, { waitUntil: "domcontentloaded" });
  const castLinks = page.locator('a[href^="/person/"]');
  await castLinks.first().waitFor({ timeout: 30_000 });
  const castCount = await castLinks.count();
  check("le righe del cast sono link a /person/<id>", castCount > 0, `${castCount} link`);

  const primoNome = (await castLinks.first().locator("p").first().innerText()).trim();
  await castLinks.first().click();
  await page.waitForURL(/\/person\/\d+$/, { timeout: 30_000 });
  personId = page.url().match(/\/person\/(\d+)$/)?.[1] ?? null;
  check("il click sul primo nome apre /person/<id>", Boolean(personId), page.url());

  // 2. la pagina della persona -------------------------------------------------
  await page.locator("h1").first().waitFor({ timeout: 30_000 });
  const nomeTitolo = (await page.locator("h1").first().innerText()).trim();
  check(
    "il nome della persona e' il titolo (h1)",
    nomeTitolo.length > 0 && nomeTitolo === primoNome,
    `"${nomeTitolo}" vs cast "${primoNome}"`,
  );

  const foto = page.getByAltText(nomeTitolo, { exact: true });
  check("c'e' la foto", (await foto.count()) > 0);

  const testiPillole = await page.locator('[role="tab"]').allInnerTexts();
  check(
    "le pillole Tutto / Film / Serie TV ci sono",
    ["Tutto", "Film", "Serie TV"].every((t) => testiPillole.includes(t)),
    testiPillole.join(", "),
  );

  const grigliaTutto = await page.locator('a[href^="/title/"]').count();
  check("c'e' una griglia di locandine", grigliaTutto > 0, `${grigliaTutto} locandine`);

  await page.locator('[role="tab"]', { hasText: /^Film$/ }).click();
  await page.waitForTimeout(500);
  const grigliaFilm = await page.locator('a[href^="/title/"]').count();
  const vuotoFilm = (await page.getByText("Niente da mostrare").count()) > 0;
  check(
    "la pillola Film cambia la griglia",
    grigliaFilm !== grigliaTutto || vuotoFilm,
    `tutto=${grigliaTutto} film=${grigliaFilm} vuoto=${vuotoFilm}`,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("niente scroll orizzontale a 400px", overflow <= 1, `overflow=${overflow}px`);
  await page.screenshot({ path: `${SHOT}/persona-pagina.png` });

  // 3. il cuore -------------------------------------------------------------
  const cuore = page.locator("main button[aria-pressed]").first();
  await cuore.waitFor({ timeout: 15_000 });
  check("il cuore parte spento", (await cuore.getAttribute("aria-pressed")) === "false");

  await cuore.click();
  await aspettaCuore("true");
  check("il cuore si accende al click", true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await cuore.waitFor({ timeout: 15_000 });
  const acceseDopoReload = await cuore.getAttribute("aria-pressed");
  check(
    "il cuore resta acceso dopo il reload (salvato davvero)",
    acceseDopoReload === "true",
    `aria-pressed=${acceseDopoReload}`,
  );
  await page.screenshot({ path: `${SHOT}/persona-cuore-acceso.png` });

  await cuore.click();
  await aspettaCuore("false");
  check("il cuore si spegne al secondo click", true);

  // 4. il profilo -------------------------------------------------------------
  // si rimette il preferito prima di andare sul profilo
  await cuore.click();
  await aspettaCuore("true");

  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  const scaffale = page.locator("h2", { hasText: "Attori e registi preferiti" });
  await scaffale.waitFor({ timeout: 30_000 });
  const inScaffale = await page.locator(`a[href="/person/${personId}"]`).count();
  check(
    "lo scaffale 'Attori e registi preferiti' c'e' con quel nome",
    inScaffale > 0,
    `${inScaffale} occorrenze del link`,
  );
  await page.screenshot({ path: `${SHOT}/profilo-scaffale.png` });

  // 5. la ricerca -------------------------------------------------------------
  await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="search"]', "nolan");
  const sezionePersone = page
    .locator("section")
    .filter({ has: page.locator("h2", { hasText: "Persone" }) });
  await sezionePersone.waitFor({ timeout: 15_000 });
  const linkPersone = sezionePersone.locator('a[href^="/person/"]');
  const numPersone = await linkPersone.count();
  check("la riga 'Persone' compare con almeno un risultato", numPersone > 0, `${numPersone} persone`);
  await page.screenshot({ path: `${SHOT}/ricerca-persone.png` });

  await linkPersone.first().click();
  await page.waitForURL(/\/person\/\d+$/, { timeout: 15_000 });
  check("cliccando si apre la pagina di quella persona", /\/person\/\d+$/.test(page.url()), page.url());

  // 6. il cast non ha perso il resto -------------------------------------------
  await page.goto(`${BASE}/title/tv/${TV_ID}`, { waitUntil: "domcontentloaded" });
  const castAncora = page.locator('a[href^="/person/"]');
  await castAncora.first().waitFor({ timeout: 30_000 });
  check("il cast c'e' ancora sulla scheda", (await castAncora.count()) > 0);

  const personaggioPreferito = page.locator("h2", { hasText: "Personaggio preferito" });
  await personaggioPreferito.first().waitFor({ timeout: 30_000 }).catch(() => {});
  check(
    "la sezione 'Personaggio preferito' non e' stata rotta dal merge",
    (await personaggioPreferito.count()) > 0,
  );
  await page.screenshot({ path: `${SHOT}/titolo-cast-e-personaggio.png` });
} catch (e) {
  esiti.push(`KO  eccezione — ${e.message ?? e}`);
} finally {
  await browser.close();
  const { error: delError } = await admin.auth.admin.deleteUser(me.id);
  if (delError) {
    console.error(`ATTENZIONE: pulizia dell'utente finto ${me.id} fallita — ${delError.message}`);
  }
  console.log(esiti.join("\n"));
  const fallito = esiti.some((r) => r.startsWith("KO"));
  // il rumore di rete/console si stampa solo se serve a capire un rosso: a bordo
  // campo c'e' sempre qualche pageerror del service worker bloccato (trappola nota).
  if (fallito && erroriConsole.length > 0) {
    console.log("\n--- console/pageerror/requestfailed del browser (diagnosi) ---");
    console.log(erroriConsole.join("\n"));
  }
  if (fallito) process.exitCode = 1;
}
