/**
 * Podio della domanda del giorno: semina una classifica finta su ieri, apre il
 * popup con una sessione vera e fotografa telefono e desktop.
 *   BASE=http://localhost:3418 node --env-file=.env.local scripts/daily-podium-shot.mjs
 * Va lanciato **prima** di avviare il server: il conteggio del podio sta in
 * `unstable_cache`, quindi un giorno gia' letto non cambia piu' nel processo.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3418";
const SHOT = process.env.SHOT ?? ".shots";
mkdirSync(SHOT, { recursive: true });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const rome = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
const today = rome(new Date());
const yesterday = rome(new Date(Date.now() - 86400000));

// la domanda di ieri: se non c'e' la creiamo e a fine giro la togliamo
let seededQuestion = null;
let { data: question } = await admin
  .from("daily_questions")
  .select("id, text")
  .eq("ask_on", yesterday)
  .maybeSingle();
if (!question) {
  const { data, error } = await admin
    .from("daily_questions")
    .insert({ ask_on: yesterday, text: "Il film che rivedi sempre volentieri?" })
    .select("id, text")
    .single();
  if (error) throw error;
  question = data;
  seededQuestion = data.id;
}

// tre titoli veri gia' in cache, con locandina e fotogramma
const { data: titles, error: titlesError } = await admin
  .from("titles")
  .select("id, media_type, title, poster_path, backdrop_path")
  .not("poster_path", "is", null)
  .not("backdrop_path", "is", null)
  .limit(3);
if (titlesError) throw titlesError;
if (!titles || titles.length < 3) throw new Error("servono 3 titoli in cache");

const reasons = [
  "Lo metto su ogni volta che piove e non mi stanca mai.",
  null,
  null,
  "Mio padre me l'ha fatto vedere a otto anni, e ancora lo cito.",
  null,
  null,
];
const votanti = [];
const password = `Pod!${Date.now()}aA1`;
// 3 voti al primo, 2 al secondo, 1 al terzo
const piano = [0, 0, 0, 1, 1, 2];
for (let i = 0; i < piano.length; i += 1) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zapp.podio.${Date.now()}.${i}@example.com`,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  votanti.push(data.user.id);
  await admin
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      display_name: ["Giulia", "Marco", "Sara", "Luca", "Elena", "Davide"][i],
    })
    .eq("id", data.user.id);
  const t = titles[piano[i]];
  const { error: ansError } = await admin.from("daily_answers").insert({
    question_id: question.id,
    user_id: data.user.id,
    title_id: t.id,
    media_type: t.media_type,
    reason: reasons[i],
    created_at: `${yesterday}T20:0${i}:00Z`,
  });
  if (ansError) throw ansError;
}

// lo spettatore: nessuna risposta, nessun "visto", cosi' il popup si apre da solo
const { data: viewer, error: viewerError } = await admin.auth.admin.createUser({
  email: `zapp.podio.viewer.${Date.now()}@example.com`,
  password,
  email_confirm: true,
});
if (viewerError) throw viewerError;
await admin
  .from("profiles")
  .update({ onboarding_completed_at: new Date().toISOString() })
  .eq("id", viewer.user.id);

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
  await page.fill('input[type="email"]', viewer.user.email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').click({ noWaitAfter: true });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  const dialog = page.locator('[role="dialog"][aria-label="La domanda del giorno"]');
  await dialog.waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT}/podio-390-coriandoli.png` });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${SHOT}/podio-390.png` });
  const box = await dialog.boundingBox();
  const vh = page.viewportSize().height;
  console.log(
    `telefono: card y=${Math.round(box.y)} h=${Math.round(box.height)} (viewport ${vh})`,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT}/podio-1440.png` });
  const b2 = await dialog.boundingBox();
  const scroller = dialog.locator("div").filter({ has: page.locator("section") }).first();
  const overflow = await scroller.evaluate((el) => {
    const s = el.querySelector("section");
    return s ? s.scrollHeight - s.clientHeight : -1;
  });
  console.log(
    `desktop: card ${Math.round(b2.width)}x${Math.round(b2.height)}, eccedenza podio ${overflow}px`,
  );
} finally {
  await browser.close();
  for (const id of [...votanti, viewer.user.id]) await admin.auth.admin.deleteUser(id);
  if (seededQuestion) await admin.from("daily_questions").delete().eq("id", seededQuestion);
  console.log(`domanda di ieri: ${question.text} (oggi ${today})`);
}
