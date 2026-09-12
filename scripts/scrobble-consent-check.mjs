/**
 * Prova del blocco: /api/scrobble deve rifiutare senza consenso `scrobble` e
 * accettare appena c'è. Crea un utente e un dispositivo finti, poi ripulisce.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3402";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const esiti = [];
const check = (nome, ok, extra = "") =>
  esiti.push(`${ok ? "OK  " : "FAIL"} ${nome}${extra ? ` — ${extra}` : ""}`);

const token = `zc_${randomBytes(32).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token).digest("hex");

const { data: utente, error: erroreUtente } = await admin.auth.admin.createUser({
  email: `zapp.scrobble.${Date.now()}@example.com`,
  password: `Scr!${Date.now()}aA1`,
  email_confirm: true,
});
if (erroreUtente) throw erroreUtente;
const userId = utente.user.id;

const { data: device, error: erroreDevice } = await admin
  .from("devices")
  .insert({
    install_id: randomUUID(),
    token_hash: tokenHash,
    name: "Prova consenso",
    platform: "browser_ext",
  })
  .select("id")
  .single();
if (erroreDevice) throw erroreDevice;

await admin.from("device_members").insert({ device_id: device.id, user_id: userId });

const evento = {
  events: [
    {
      site: "netflix",
      state: "playing",
      at: new Date().toISOString(),
      position: 120,
      duration: 3600,
      url: "https://www.netflix.com/watch/80100172",
      title: "Stranger Things",
    },
  ],
};

const manda = async () =>
  fetch(`${BASE}/api/scrobble`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(evento),
  });

try {
  const senza = await manda();
  const corpoSenza = await senza.json().catch(() => ({}));
  check(
    "senza consenso: 403",
    senza.status === 403 && corpoSenza.code === "consent_required",
    `HTTP ${senza.status} ${JSON.stringify(corpoSenza).slice(0, 80)}`,
  );

  const { count: sessioniDopoRifiuto } = await admin
    .from("watch_sessions")
    .select("id", { count: "exact", head: true })
    .eq("device_id", device.id);
  check("senza consenso: nessuna sessione scritta", (sessioniDopoRifiuto ?? 0) === 0);

  await admin.from("user_consents").insert({
    user_id: userId,
    kind: "scrobble",
    version: "1",
    granted_at: new Date().toISOString(),
  });

  const con = await manda();
  check("con consenso: non più 403", con.status !== 403, `HTTP ${con.status}`);

  await admin
    .from("user_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", "scrobble");

  const dopoRevoca = await manda();
  check("dopo la revoca: di nuovo 403", dopoRevoca.status === 403, `HTTP ${dopoRevoca.status}`);
} finally {
  await admin.from("watch_sessions").delete().eq("device_id", device.id);
  await admin.from("pending_scrobbles").delete().eq("device_id", device.id);
  await admin.from("device_members").delete().eq("device_id", device.id);
  await admin.from("devices").delete().eq("id", device.id);
  await admin.auth.admin.deleteUser(userId);
}

console.log(esiti.join("\n"));
if (esiti.some((r) => r.startsWith("FAIL"))) process.exit(1);
