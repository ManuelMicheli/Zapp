/**
 * Popup della domanda del giorno sul telefono: scorrendo verso il basso il contenuto
 * deve muoversi in verticale e la card **non** deve scivolare di lato.
 *   BASE=http://localhost:3418 node --env-file=.env.local scripts/daily-scroll-check.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3418";
const SHOT = process.env.SHOT ?? ".";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const password = `Day!${Date.now()}aA1`;

const { data, error } = await admin.auth.admin.createUser({
  email: `zapp.daily.${Date.now()}@example.com`,
  password,
  email_confirm: true,
});
if (error) throw error;
const id = data.user.id;
await admin
  .from("profiles")
  .update({ onboarding_completed_at: new Date().toISOString() })
  .eq("id", id);

const results = [];
const check = (n, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);

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

  // il popup si apre da solo alla prima apertura del giorno
  const dialog = page.locator('[role="dialog"][aria-label="La domanda del giorno"]');
  await dialog.waitFor({ timeout: 30000 });
  check("popup aperto", await dialog.isVisible());

  // schermo corto: il contenuto della schermata deve sicuramente eccedere la card,
  // altrimenti il trascinamento verticale non prova niente
  await page.setViewportSize({ width: 390, height: 560 });
  await page.waitForTimeout(400);

  const scroller = dialog.locator("div").filter({ has: page.locator("section") }).first();
  const before = await scroller.evaluate((el) => ({
    left: el.scrollLeft,
    x: el.getBoundingClientRect().x,
  }));

  // trascinamento verticale al centro della card, come il dito dell'utente
  const box = await dialog.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.62;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 14; i += 1) await page.mouse.move(cx, cy - i * 18);
  await page.mouse.up();
  await page.waitForTimeout(400);
  // il trascinamento col mouse non scorre un contenitore in Chromium: la rotella sì,
  // ed è lo stesso scorrimento che lo snap orizzontale disturbava
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(900);

  const after = await scroller.evaluate((el) => ({
    left: el.scrollLeft,
    x: el.getBoundingClientRect().x,
    sectionTop: el.querySelector("section")?.scrollTop ?? -1,
    sectionScrollable:
      (el.querySelector("section")?.scrollHeight ?? 0) >
      (el.querySelector("section")?.clientHeight ?? 0),
  }));

  check(
    "la card non scivola di lato",
    Math.abs(after.left - before.left) < 2 && Math.abs(after.x - before.x) < 2,
    `scrollLeft ${before.left}→${after.left}, x ${Math.round(before.x)}→${Math.round(after.x)}`,
  );
  check(
    "il contenuto scorre in verticale",
    !after.sectionScrollable || after.sectionTop > 0,
    `scrollTop=${after.sectionTop}, scorrevole=${after.sectionScrollable}`,
  );
  await page.screenshot({ path: `${SHOT}/daily-390.png` });

  // lo scorrimento laterale deve restare possibile dove ci sono due schermate
  const slides = await dialog.locator("section").count();
  if (slides > 1) {
    await page.locator('[aria-label="Avanti"]').click();
    await page.waitForTimeout(700);
    const moved = await scroller.evaluate((el) => el.scrollLeft);
    check("si passa alla seconda schermata", moved > 10, `scrollLeft=${moved}`);
  } else {
    results.push("--  una sola schermata: passaggio laterale non provato");
  }
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(id);
  console.log(results.join("\n"));
}
