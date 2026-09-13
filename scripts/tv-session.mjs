// node --env-file=.env.local scripts/tv-session.mjs <user_id>
// Conia una sessione TV e un dispositivo finto: stampa ACCESS, REFRESH, DEVICE.
// Alla fine: node --env-file=.env.local scripts/tv-session.mjs --pulisci <DEVICE>
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });

const [arg, valore] = process.argv.slice(2);
if (arg === "--pulisci") {
  const { error } = await admin.from("devices").delete().eq("id", valore);
  console.log(error ? `errore: ${error.message}` : "dispositivo cancellato (cascata)");
  process.exit(0);
}
const userId = arg;
if (!userId) throw new Error("uso: tv-session.mjs <user_id> | --pulisci <device_id>");

const { data: utente } = await admin.auth.admin.getUserById(userId);
const { data: link } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: utente.user.email,
});
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await anonClient.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (error) throw error;

const token = randomUUID();
const { data: device } = await admin
  .from("devices")
  .insert({
    install_id: randomUUID(),
    token_hash: createHash("sha256").update(token).digest("hex"),
    name: "TV di prova",
    platform: "android_tv",
  })
  .select("id")
  .single();
await admin.from("device_members").insert({ device_id: device.id, user_id: userId });

console.log(`ACCESS=${data.session.access_token}`);
console.log(`REFRESH=${data.session.refresh_token}`);
console.log(`DEVICE=${device.id}`);
console.log(`DEVICE_TOKEN=${token}`);
