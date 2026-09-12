/**
 * Prova il giro completo: pubblicare un commento con una GIF sulla scheda
 * titolo e su un episodio, e rileggerlo dal database nel formato versionato.
 *   BASE=http://localhost:3403 node --env-file=.env.local scripts/klipy-publish-check.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3403";
const SHOT = process.env.SHOT ?? "C:/Users/Manum/AppData/Local/Temp/claude/D--PROGETTI-Zapp/130badf6-c55e-4c29-b2a3-5470facda63f/scratchpad/shots-pub";
mkdirSync(SHOT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password = `Pub!${Date.now()}aA1`;
const { data, error } = await admin.auth.admin.createUser({ email: `zapp.pub.${Date.now()}@example.com`, password, email_confirm: true });
if (error) throw error;
const id = data.user.id;
await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString(), username: `prova${Date.now()}`.slice(0, 20) }).eq("id", id);
const { data: today } = await admin.from("daily_questions").select("ask_on").lte("ask_on", new Date().toISOString().slice(0, 10)).order("ask_on", { ascending: false }).limit(1).maybeSingle();
if (today) await admin.from("daily_question_views").insert({ user_id: id, ask_on: today.ask_on });

const out = [];
const check = (n, ok, extra = "") => out.push(`${ok ? "OK  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
const page = await context.newPage();
const tiles = () => page.locator('button[aria-label^="Aggiungi "]:has(img)');

async function componi(scope) {
  const gif = scope.locator('button[aria-label="Aggiungi GIF"]').first();
  await gif.waitFor({ timeout: 30000 });
  // la pagina stagione idrata a pezzi: l'elemento puo' staccarsi mentre lo si scorre
  await gif.click({ timeout: 30000 });
  await tiles().first().waitFor({ timeout: 25000 });
  await tiles().first().click();
  await scope.locator('button[aria-label="Rimuovi allegato"]').waitFor({ timeout: 10000 });
  const box = scope.locator("textarea").first();
  await box.fill("Prova automatica, si cancella da sola.");
  await scope.getByRole("button", { name: "Pubblica" }).first().click();
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', data.user.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  // 1) scheda titolo (film)
  await page.goto(`${BASE}/title/movie/603`, { waitUntil: "domcontentloaded" });
  await componi(page);
  await page.waitForTimeout(2500);
  const { data: rows } = await admin.from("title_comments").select("body, media_type, season_number, episode_number").eq("user_id", id);
  const film = (rows ?? []).find((r) => r.media_type === "movie");
  check("commento del film salvato", !!film);
  check("corpo nel formato versionato", !!film && film.body.includes("[zapp-media:1]"), film ? film.body.slice(0, 60) : "");
  check("niente season/episode sul film", !!film && film.season_number === null && film.episode_number === null);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(':text("Prova automatica")').first().waitFor({ timeout: 20000 });
  check("commento visibile dopo il ricarico", true);
  await page.locator(':text("Prova automatica")').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT}/pubblicato-film.png` });

  // 2) episodio (pagina stagione)
  await page.goto(`${BASE}/title/tv/1396/season/1`, { waitUntil: "domcontentloaded" });
  await page.locator('button[aria-label="Aggiungi GIF"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await componi(page);
  await page.waitForTimeout(2500);
  const { data: rows2 } = await admin.from("title_comments").select("media_type, season_number, episode_number, body").eq("user_id", id).eq("media_type", "tv");
  const ep = (rows2 ?? [])[0];
  check("commento dell'episodio salvato", !!ep, ep ? `S${ep.season_number}E${ep.episode_number}` : "");
  check("stagione ed episodio valorizzati", !!ep && ep.season_number != null && ep.episode_number != null);
  await page.screenshot({ path: `${SHOT}/pubblicato-episodio.png` });
} catch (e) {
  check("esecuzione", false, String(e).slice(0, 300));
  await page.screenshot({ path: `${SHOT}/errore.png` }).catch(() => {});
} finally {
  await browser.close();
  await admin.from("title_comments").delete().eq("user_id", id);
  await admin.auth.admin.deleteUser(id);
}
console.log(out.join("\n"));
console.log(`\nschermate in ${SHOT}`);
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
