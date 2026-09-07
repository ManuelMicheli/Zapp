/**
 * Controllo di sicurezza contro un'istanza in esecuzione.
 *
 *   NEXT_DIST_DIR=.next-sec pnpm build
 *   NEXT_DIST_DIR=.next-sec pnpm exec next start -p 3411
 *   node scripts/security-check.mjs                    # default http://localhost:3411
 *   BASE=https://zapp-mu.vercel.app node scripts/security-check.mjs
 *
 * Tre gruppi di verifiche:
 *  1. header di sicurezza presenti e col valore giusto;
 *  2. le rotte protette non rispondono a chi non ha una sessione, e i redirect
 *     non si lasciano portare fuori dal sito;
 *  3. le pagine pubbliche si rendono davvero, senza violazioni CSP in console
 *     (la CSP e' facile da stringere troppo e il danno si vede solo a runtime).
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE ?? "http://localhost:3411").replace(/\/$/, "");
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok " : "  NO "} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------- 1. header ----------
const EXPECTED_HEADERS = [
  ["content-security-policy", /default-src 'self'/, "default-src 'self'"],
  ["content-security-policy", /object-src 'none'/, "object-src 'none'"],
  ["content-security-policy", /frame-ancestors 'none'/, "frame-ancestors 'none'"],
  ["content-security-policy", /base-uri 'self'/, "base-uri 'self'"],
  ["content-security-policy", /form-action 'self'/, "form-action 'self'"],
  ["strict-transport-security", /max-age=\d{7,}/, "HSTS almeno un anno"],
  ["x-content-type-options", /^nosniff$/, "nosniff"],
  ["x-frame-options", /^DENY$/, "DENY"],
  ["cross-origin-opener-policy", /same-origin/, "COOP same-origin"],
  ["cross-origin-resource-policy", /same-origin/, "CORP same-origin"],
  ["referrer-policy", /strict-origin/, "referrer stretto"],
  ["permissions-policy", /camera=\(\)/, "camera spenta"],
];

console.log(`\n[1] Header di sicurezza su ${BASE}/login`);
const headRes = await fetch(`${BASE}/login`, { redirect: "manual" });
for (const [header, re, label] of EXPECTED_HEADERS) {
  const value = headRes.headers.get(header) ?? "";
  check(`${header}: ${label}`, re.test(value), value ? "" : "header assente");
}

// ---------- 2. rotte e redirect ----------
console.log(`\n[2] Rotte protette e redirect`);

for (const path of ["/", "/library", "/friends", "/profile", "/cinema", "/notifications"]) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  check(
    `${path} senza sessione manda al login`,
    res.status >= 300 && res.status < 400 && loc.includes("/login"),
    `HTTP ${res.status} -> ${loc || "(nessun location)"}`,
  );
}

for (const path of ["/api/search?q=matrix", "/api/tmdb/search/multi?query=x"]) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  check(`${path} senza sessione risponde 401`, res.status === 401, `HTTP ${res.status}`);
}

const OPEN_REDIRECTS = [
  "//evil.example",
  "https://evil.example",
  "/\\evil.example",
  "http://evil.example",
];
for (const next of OPEN_REDIRECTS) {
  const res = await fetch(
    `${BASE}/auth/callback?next=${encodeURIComponent(next)}`,
    { redirect: "manual" },
  );
  const loc = res.headers.get("location") ?? "";
  // In locale `NEXT_PUBLIC_APP_URL` puo' puntare a un'altra porta rispetto a
  // BASE: cio' che conta e' che il redirect non finisca mai sull'host indicato
  // dal parametro.
  let host = "";
  try {
    host = new URL(loc, BASE).host;
  } catch {
    host = "(illeggibile)";
  }
  check(
    `/auth/callback non si fa portare su ${next}`,
    host !== "evil.example" && !loc.includes("evil.example"),
    `-> ${loc}`,
  );
}

// ---------- 3. rendering e CSP ----------
console.log(`\n[3] Pagine pubbliche: rendering e violazioni CSP`);
const browser = await chromium.launch();
const ctx = await browser.newContext();
for (const path of ["/login", "/signup"]) {
  const page = await ctx.newPage();
  const violations = [];
  const errors = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) violations.push(t);
    else if (m.type() === "error") errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(e.message));

  const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  const bodyLen = (await page.textContent("body"))?.trim().length ?? 0;
  const broken = await page.$$eval(
    "img",
    (els) => els.filter((e) => e.complete && e.naturalWidth === 0).length,
  );

  check(`${path} risponde 200`, res?.status() === 200, `HTTP ${res?.status()}`);
  check(`${path} si rende`, bodyLen > 50, `${bodyLen} caratteri di testo`);
  check(`${path} nessuna violazione CSP`, violations.length === 0, violations.join(" | "));
  check(`${path} nessuna immagine rotta`, broken === 0, `${broken} rotte`);
  if (errors.length) {
    console.log(`  (errori in console, non bloccanti: ${errors.slice(0, 3).join(" | ").slice(0, 300)})`);
  }
  await page.close();
}
await browser.close();

// ---------- esito ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${"=".repeat(60)}`);
console.log(`${results.length - failed.length}/${results.length} controlli passati`);
if (failed.length) {
  console.log("\nFALLITI:");
  for (const f of failed) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
}
process.exit(failed.length ? 1 : 0);
