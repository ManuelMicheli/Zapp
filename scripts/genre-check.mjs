/**
 * Verifica delle pillole "per genere" contro un'istanza avviata: la fila in home è il
 * catalogo curato, e la pagina di una voce si apre piena.
 *
 *   NEXT_DIST_DIR=.next-genre pnpm build
 *   NEXT_DIST_DIR=.next-genre pnpm exec next start -p 3401
 *   BASE=http://localhost:3401 node --env-file=.env.local scripts/genre-check.mjs
 *
 * Crea un utente finto, entra dal form vero e lo cancella alla fine. Le due trappole di
 * `nav-check.mjs` valgono identiche: il **service worker** va bloccato (altrimenti
 * arriva l'HTML di una build vecchia) e la **domanda del giorno** va segnata come già
 * vista, o il suo overlay copre la pagina.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3401";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error("mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Gen!${Date.now()}aA1`;

async function makeUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.genre.${Date.now()}@example.com`,
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
  return { id, email: data.user.email };
}

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);

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
  await page.waitForTimeout(2500);

  // 1. la fila delle pillole è il catalogo, non l'elenco di TMDB
  const pillole = await page.locator('a[href^="/discover/movie/"]').allInnerTexts();
  check("pillole dal catalogo", pillole.length >= 15, `${pillole.length} voci`);
  check("c'è Classici", pillole.includes("Classici"));
  check("c'è Anime", pillole.includes("Anime"));
  check("niente Film TV", !pillole.includes("Film TV"), pillole.join(", "));

  // 2. la pagina di una voce si apre, con titolo, sottotitolo e copertine
  await page.goto(`${BASE}/discover/movie/classici`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const titolo = await page.locator("h1").first().innerText();
  check("titolo della voce", titolo.trim() === "Classici", titolo);
  const crumb = await page.locator("[data-crumb]").first().innerText();
  check("briciola a Scopri", crumb.trim() === "Scopri", crumb);
  const copertine = await page.locator('a[href^="/title/"]').count();
  check("la pagina è piena", copertine >= 20, `${copertine} copertine`);
  const testo = await page.locator("main").innerText();
  check("in cima c'e' un classico vero", testo.includes("Il padrino"));
  await page.screenshot({ path: "genre-classici.png", fullPage: false });

  // 3. la scheda Serie porta alla stessa voce, con le serie. Si **clicca**: la pillola
  // deve essere davvero raggiungibile, non solo presente nell'HTML.
  const coperta = await page.evaluate(() => {
    const a = document.querySelector('a[href="/discover/tv/classici"]');
    if (!a) return "manca la pillola";
    const r = a.getBoundingClientRect();
    const sopra = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return sopra && !a.contains(sopra) ? sopra.className || sopra.tagName : null;
  });
  check("la pillola Serie non è coperta", coperta === null, String(coperta));
  await page.click('a[href="/discover/tv/classici"]', { timeout: 15_000 });
  // la prima resa di una voce chiede tre pagine a TMDB: la navigazione può essere lenta
  await page.waitForURL(/\/discover\/tv\/classici$/, { timeout: 60_000 });
  await page.waitForTimeout(4000);
  const serie = await page.locator('a[href^="/title/tv/"]').count();
  const film = await page.locator('a[href^="/title/movie/"]').count();
  check("sotto Serie ci sono solo serie", serie >= 10 && film === 0, `${serie}/${film}`);

  // 4. dalla pagina Scopri le pillole navigano davvero (stesso pathname, prima, non
  // faceva niente: il genere sta nel percorso proprio per questo)
  await page.goto(`${BASE}/discover`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.click('a[href="/discover/movie/horror"]', { timeout: 15_000 });
  await page.waitForURL(/\/discover\/movie\/horror$/, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const daScopri = await page.locator("h1").first().innerText();
  check("da Scopri si apre il genere", daScopri.trim() === "Horror", daScopri);

  // 5. una chiave inventata dà la pagina "non trovata", non una lista a caso. Lo stato
  // HTTP resta 200: con un `loading.tsx` la risposta parte prima che `notFound()` venga
  // chiamato, quindi si guarda cosa vede l'utente, non l'intestazione.
  await page.goto(`${BASE}/discover/movie/non-esiste`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const corpo = await page.locator("body").innerText();
  check(
    "chiave inventata → non trovata",
    /404|non trovat|not be found/i.test(corpo),
    corpo.slice(0, 60).replace(/\s+/g, " "),
  );

  // 6. il vecchio link per id TMDB continua a funzionare
  await page.goto(`${BASE}/discover?type=movie&genre=27`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  const vecchio = await page.locator("h1").first().innerText();
  check(
    "vecchio link ?genre=27 → Horror",
    vecchio.trim() === "Horror" && /\/discover\/movie\/horror$/.test(page.url()),
    `${vecchio} ${page.url()}`,
  );
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(me.id);
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
}
