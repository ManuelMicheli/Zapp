/**
 * Popup "Dove sei?" della sezione Cinema: l'elenco dei comuni deve stare dentro lo
 * schermo, scorrere senza chiudere il foglio, e la scelta deve salvare la posizione.
 *   BASE=http://localhost:3417 node --env-file=.env.local popup-check.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3417";
const SHOT = process.env.SHOT ?? ".";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });
const password = `Pop!${Date.now()}aA1`;

const { data, error } = await admin.auth.admin.createUser({
  email: `zapp.popup.${Date.now()}@example.com`,
  password,
  email_confirm: true,
});
if (error) throw error;
const id = data.user.id;
await admin
  .from("profiles")
  .update({ onboarding_completed_at: new Date().toISOString() })
  .eq("id", id);
await admin.from("user_locations").upsert({
  user_id: id,
  lat: 45.4642,
  lng: 9.19,
  label: "Milano",
  province_slug: "milano",
});
const { data: today } = await admin
  .from("daily_questions")
  .select("ask_on")
  .lte("ask_on", new Date().toISOString().slice(0, 10))
  .order("ask_on", { ascending: false })
  .limit(1)
  .maybeSingle();
if (today) await admin.from("daily_question_views").insert({ user_id: id, ask_on: today.ask_on });

const results = [];
const check = (n, ok, extra = "") => results.push(`${ok ? "OK  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', data.user.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(`${BASE}/cinema`, { waitUntil: "domcontentloaded" });
  const chip = page.locator('button:has-text("Cambia")').first();
  await chip.waitFor({ timeout: 30000 });
  await chip.click();
  const sheet = page.locator('[role="dialog"]');
  await sheet.waitFor({ timeout: 20000 });
  check("popup aperto", await sheet.isVisible());

  const field = page.locator('input[placeholder="Scrivi il tuo comune"]');
  await field.waitFor({ timeout: 20000 });
  await field.fill("mila");
  const list = page.locator('[role="dialog"] ul');
  await list.first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  const box = await list.first().boundingBox();
  const vh = page.viewportSize().height;
  check("elenco dentro lo schermo", !!box && box.y >= 0 && box.y + box.height <= vh + 1,
    `y=${Math.round(box.y)} h=${Math.round(box.height)} vh=${vh}`);
  const n = await list.first().locator("li").count();
  check("suggerimenti", n > 0, `${n} voci`);
  await page.screenshot({ path: `${SHOT}/popup-390.png` });

  // scorrere l'elenco non deve chiudere il foglio
  const first = list.first().locator("li button").first();
  const fb = await first.boundingBox();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + 10);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + 160, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  check("il foglio resta aperto dopo lo scorrimento", await sheet.isVisible());

  // scelta comune
  await field.fill("ossona");
  await page.waitForTimeout(400);
  await page.locator('[role="dialog"] ul li button', { hasText: "Ossona" }).first().click();
  await page.waitForTimeout(2500);
  const { data: row } = await admin
    .from("user_locations")
    .select("label, province_slug")
    .eq("user_id", id)
    .maybeSingle();
  check("posizione salvata", row?.label?.toLowerCase().includes("ossona"), JSON.stringify(row));
  check("popup chiuso dopo la scelta", (await page.locator('[role="dialog"]').count()) === 0);

  // schermo corto (tastiera aperta sul telefono): l'elenco si apre in su
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto(`${BASE}/cinema`, { waitUntil: "domcontentloaded" });
  await page.locator('button:has-text("Cambia")').first().click();
  const f3 = page.locator('input[placeholder="Scrivi il tuo comune"]');
  await f3.waitFor({ timeout: 20000 });
  await f3.fill("mila");
  await page.locator('[role="dialog"] ul').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  const b3 = await page.locator('[role="dialog"] ul').first().boundingBox();
  const s3 = await page.locator('[role="dialog"]').boundingBox();
  check("schermo corto: il foglio ci sta e l'elenco comincia a schermo",
    !!b3 && !!s3 && s3.y >= 0 && s3.y + s3.height <= 421 && b3.y >= 0 && b3.y < 420,
    `foglio y=${Math.round(s3.y)} h=${Math.round(s3.height)}, elenco y=${Math.round(b3.y)}`);
  await page.screenshot({ path: `${SHOT}/popup-corto.png` });

  // desktop: l'elenco si apre in giù e resta visibile
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/cinema`, { waitUntil: "domcontentloaded" });
  await page.locator('button:has-text("Cambia")').first().click();
  const f2 = page.locator('input[placeholder="Scrivi il tuo comune"]');
  await f2.waitFor({ timeout: 20000 });
  await f2.fill("mila");
  await page.locator('[role="dialog"] ul').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  const b2 = await page.locator('[role="dialog"] ul').first().boundingBox();
  check("desktop: elenco dentro lo schermo", !!b2 && b2.y >= 0 && b2.y + b2.height <= 901,
    `y=${Math.round(b2.y)} h=${Math.round(b2.height)}`);
  await page.screenshot({ path: `${SHOT}/popup-1440.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(id);
  console.log(results.join("\n"));
}
