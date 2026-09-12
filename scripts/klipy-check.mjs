/**
 * Collaudo del selettore KLIPY nel composer dei commenti, sulla build vera.
 *   BASE=http://localhost:3402 node --env-file=.env.local <questo file>
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3402";
const SHOT = process.env.SHOT ?? "C:/Users/Manum/AppData/Local/Temp/claude/D--PROGETTI-Zapp/130badf6-c55e-4c29-b2a3-5470facda63f/scratchpad/shots";
mkdirSync(SHOT, { recursive: true });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const password = `Klp!${Date.now()}aA1`;
const { data, error } = await admin.auth.admin.createUser({
  email: `zapp.klipy.${Date.now()}@example.com`,
  password,
  email_confirm: true,
});
if (error) throw error;
const id = data.user.id;
await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", id);
// il popup della domanda del giorno copre la pagina: segnarlo come gia' visto
const { data: today } = await admin
  .from("daily_questions")
  .select("ask_on")
  .lte("ask_on", new Date().toISOString().slice(0, 10))
  .order("ask_on", { ascending: false })
  .limit(1)
  .maybeSingle();
if (today) await admin.from("daily_question_views").insert({ user_id: id, ask_on: today.ask_on });

const out = [];
const check = (n, ok, extra = "") => out.push(`${ok ? "OK  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("requestfailed", (r) => /klipy/.test(r.url()) && errors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`));

const tiles = () => page.locator('button[aria-label^="Aggiungi "]:has(img)');

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', data.user.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(`${BASE}/title/movie/603`, { waitUntil: "domcontentloaded" });
  const gif = page.locator('button[aria-label="Aggiungi GIF"]').first();
  await gif.scrollIntoViewIfNeeded({ timeout: 30000 });
  await gif.click();

  const picker = page.locator('[role="region"][aria-label="Emoji, GIF e meme"]');
  await picker.waitFor({ timeout: 20000 });
  check("selettore aperto", await picker.isVisible());
  check(
    "niente messaggio 'non ancora disponibili'",
    !(await picker.getByText("non sono ancora disponibili").count()),
  );

  await tiles().first().waitFor({ timeout: 25000 });
  const nGif = await tiles().count();
  check("GIF di tendenza caricate", nGif > 0, `${nGif} riquadri`);
  // le miniature arrivano dal CDN: aspettare che siano davvero dipinte
  const painted = async () =>
    await page.locator('[role="region"][aria-label="Emoji, GIF e meme"] img').evaluateAll(
      (imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[role="region"][aria-label="Emoji, GIF e meme"] img')]
        .filter((i) => i.complete && i.naturalWidth > 0).length >= 4,
    null,
    { timeout: 25000 },
  );
  check("miniature dipinte dal CDN KLIPY", (await painted()) >= 4, `${await painted()} immagini`);
  await picker.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT}/klipy-gif.png` });

  // ricerca
  await picker.locator("input").fill("applauso");
  await page.waitForTimeout(2500);
  const nSearch = await tiles().count();
  check("ricerca GIF", nSearch > 0, `${nSearch} riquadri per “applauso”`);
  await page.screenshot({ path: `${SHOT}/klipy-search.png` });

  for (const [label, file] of [["Meme", "meme"], ["Sticker", "sticker"]]) {
    await picker.getByRole("button", { name: label, exact: true }).click();
    await tiles().first().waitFor({ timeout: 25000 });
    const n = await tiles().count();
    check(`scheda ${label}`, n > 0, `${n} riquadri`);
    await page.screenshot({ path: `${SHOT}/klipy-${file}.png` });
  }

  const alert = await picker.locator('[role="alert"]').count();
  check("nessun errore mostrato nel selettore", alert === 0);

  // scelta di un elemento: finisce nel composer come allegato
  await picker.getByRole("button", { name: "GIF", exact: true }).click();
  await tiles().first().waitFor({ timeout: 25000 });
  await tiles().first().click();
  const attach = page.locator('button[aria-label="Rimuovi allegato"]');
  await attach.waitFor({ timeout: 10000 });
  check("elemento scelto allegato al commento", await attach.isVisible());
  // l'allegato usa l'originale, non la miniatura: pesa, quindi va aspettato
  const preview = attach.locator("xpath=../div//img");
  await preview.waitFor({ timeout: 20000 });
  const ok = await preview.evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false);
  const shown = ok || (await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button[aria-label="Rimuovi allegato"]')][0];
      const img = b?.parentElement?.querySelector("img");
      return !!img && img.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: 20000 },
  ).then(() => true).catch(() => false));
  check("anteprima dell'allegato visibile", shown);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/klipy-allegato.png` });
} catch (e) {
  check("esecuzione", false, String(e).slice(0, 300));
  await page.screenshot({ path: `${SHOT}/klipy-errore.png` }).catch(() => {});
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(id);
}

const klipyErr = errors.filter((e) => /klipy|Catalogo|catalogo/i.test(e));
check("nessun errore di rete/console su KLIPY", klipyErr.length === 0, klipyErr.slice(0, 3).join(" | "));
console.log(out.join("\n"));
console.log(`\nschermate in ${SHOT}`);
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
