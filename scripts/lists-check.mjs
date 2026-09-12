/**
 * Banco delle liste condivise: creare una lista dalla pagina /lists, ritrovarla
 * nel database con l'utente come proprietario, aggiungere un titolo dalla
 * scheda e verificare la riga. Crea un utente finto e lo cancella in fondo.
 *   BASE=http://localhost:3405 node --env-file=.env.local scripts/lists-check.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3405";
const SHOT = process.env.SHOT ?? "C:/Users/Manum/AppData/Local/Temp/claude/D--PROGETTI-Zapp/130badf6-c55e-4c29-b2a3-5470facda63f/scratchpad/shots-liste";
mkdirSync(SHOT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password = `Lst!${Date.now()}aA1`;
const { data, error } = await admin.auth.admin.createUser({ email: `zapp.liste.${Date.now()}@example.com`, password, email_confirm: true });
if (error) throw error;
const id = data.user.id;
await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", id);
const { data: today } = await admin.from("daily_questions").select("ask_on").lte("ask_on", new Date().toISOString().slice(0, 10)).order("ask_on", { ascending: false }).limit(1).maybeSingle();
if (today) await admin.from("daily_question_views").insert({ user_id: id, ask_on: today.ask_on });

const out = [];
const check = (n, ok, extra = "") => out.push(`${ok ? "OK  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);
const nome = `Prova ${Date.now()}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
const page = await context.newPage();
const errori = [];
page.on("console", (m) => m.type() === "error" && errori.push(m.text()));

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', data.user.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(`${BASE}/lists`, { waitUntil: "domcontentloaded" });
  check("la pagina /lists risponde", !/404|non trovata/i.test(await page.title()), await page.title());
  await page.getByRole("button", { name: /crea/i }).first().click();
  await page.locator("#list-name").waitFor({ timeout: 20000 });
  await page.fill("#list-name", nome);
  await page.fill("#list-description", "Creata dal banco, si cancella da sola.");
  // tre bottoni dicono "Crea lista": quello dentro il foglio e' l'ultimo
  await page.locator('[role="dialog"], .fixed').getByRole("button", { name: "Crea lista", exact: true }).last().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/lista-creata.png` });

  const { data: liste } = await admin.from("title_lists").select("id, name, owner_id").eq("owner_id", id);
  const lista = (liste ?? [])[0];
  check("lista salvata nel database", !!lista, lista ? lista.name : "nessuna riga");
  check("il nome e' quello digitato", !!lista && lista.name === nome);
  const { data: membri } = await admin.from("title_list_members").select("role").eq("list_id", lista?.id ?? "00000000-0000-0000-0000-000000000000");
  check("il creatore risulta membro", (membri ?? []).length > 0, (membri ?? []).map((m) => m.role).join(","));
  check("la lista compare nell'elenco", await page.getByText(nome).first().isVisible().catch(() => false));

  // aggiunta di un titolo dalla scheda
  await page.goto(`${BASE}/title/movie/603`, { waitUntil: "domcontentloaded" });
  // "Aggiungi a una lista" sta dentro il foglio delle altre azioni
  const altre = page.locator('button[aria-label="Altre azioni"]').first();
  await altre.waitFor({ timeout: 30000 });
  await altre.click();
  const agg = page.getByRole("button", { name: "Aggiungi a una lista" }).first();
  await agg.waitFor({ timeout: 20000 });
  await agg.click();
  await page.getByText(nome).first().click({ timeout: 20000 });
  await page.waitForTimeout(2500);
  const { data: voci } = await admin.from("title_list_items").select("title_id, media_type").eq("list_id", lista.id);
  check("titolo aggiunto alla lista", (voci ?? []).some((v) => v.title_id === 603), `${(voci ?? []).length} voci`);
  await page.screenshot({ path: `${SHOT}/titolo-aggiunto.png` });

  await page.goto(`${BASE}/lists/${lista.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  check("la pagina della lista si apre", await page.getByText(nome).first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOT}/pagina-lista.png` });
} catch (e) {
  check("esecuzione", false, String(e).slice(0, 300));
  await page.screenshot({ path: `${SHOT}/errore.png` }).catch(() => {});
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(id);
}
const gravi = errori.filter((e) => !/favicon|manifest/i.test(e));
check("nessun errore in console", gravi.length === 0, gravi.slice(0, 2).join(" | "));
console.log(out.join("\n"));
console.log(`\nschermate in ${SHOT}`);
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
