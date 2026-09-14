/**
 * Banco delle regole del personaggio preferito (`favorite_characters`,
 * migration 0053): con la sessione di un utente vero (chiave anon, cioè quello
 * che ha il browser) si prova ciò che deve riuscire — votare, cambiare voto,
 * togliere il voto, leggere i conteggi di tutti — e ciò che non deve: votare al
 * posto di un altro, leggere il voto di un altro, un secondo voto sullo stesso
 * titolo, un voto da sloggato.
 *
 * Crea due utenti finti sul progetto vero e li cancella in fondo (i voti cadono
 * in cascata con l'utente).
 *
 *   node scripts/characters-check.mjs
 *
 * Da rilanciare a ogni modifica delle policy di `favorite_characters`.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// un titolo che sta di sicuro in `titles` (la FK composta lo esige)
const { data: title } = await admin
  .from("titles")
  .select("id, media_type")
  .not("raw->credits", "is", null)
  .limit(1)
  .maybeSingle();
if (!title) {
  console.error("nessun titolo con credits in `titles`: apri una scheda e riprova");
  process.exit(1);
}
const T = { title_id: title.id, media_type: title.media_type };

const uids = [];
const esiti = [];
function check(nome, ok, dettaglio = "") {
  esiti.push(`${ok ? "  ok  " : "  KO  "} ${nome}${dettaglio ? " — " + dettaglio : ""}`);
}

async function utente(tag) {
  const email = `zapp.chars.${tag}.${Date.now()}@example.com`;
  const password = "Prova-rls-2026!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  uids.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw se;
  return { id: data.user.id, client };
}

try {
  const a = await utente("a");
  const b = await utente("b");

  const ins = await a.client
    .from("favorite_characters")
    .upsert({ ...T, user_id: a.id, person_id: 17419, character_name: "Walter White" }, { onConflict: "user_id,title_id,media_type" })
    .select("person_id");
  check("si vota il proprio personaggio", !ins.error && ins.data?.length === 1, ins.error?.message);

  const cambio = await a.client
    .from("favorite_characters")
    .upsert({ ...T, user_id: a.id, person_id: 84497, character_name: "Jesse Pinkman" }, { onConflict: "user_id,title_id,media_type" })
    .select("person_id");
  check(
    "si cambia il voto (upsert con grant di update su tutte le colonne)",
    !cambio.error && cambio.data?.[0]?.person_id === 84497,
    cambio.error?.message,
  );

  const altrui = await a.client
    .from("favorite_characters")
    .insert({ ...T, user_id: b.id, person_id: 17419, character_name: "Walter White" });
  check("non si vota al posto di un altro", altrui.error != null, altrui.error?.code ?? "nessun errore!");

  const insB = await b.client
    .from("favorite_characters")
    .insert({ ...T, user_id: b.id, person_id: 84497, character_name: "Jesse Pinkman" });
  check("anche il secondo utente vota", !insB.error, insB.error?.message);

  const vediAltrui = await a.client.from("favorite_characters").select("user_id").eq("title_id", T.title_id).eq("media_type", T.media_type);
  check(
    "si legge solo la propria riga",
    (vediAltrui.data ?? []).length === 1 && vediAltrui.data[0].user_id === a.id,
    `${(vediAltrui.data ?? []).length} righe`,
  );

  const conteggi = await a.client.rpc("character_vote_counts", { t_id: T.title_id, t_type: T.media_type });
  const jesse = (conteggi.data ?? []).find((r) => Number(r.person_id) === 84497);
  check(
    "i conteggi sommano tutti gli utenti",
    Number(jesse?.votes) >= 2 && jesse?.character_name === "Jesse Pinkman",
    conteggi.error?.message ?? JSON.stringify(conteggi.data),
  );
  check(
    "i conteggi non dicono chi ha votato",
    (conteggi.data ?? []).every((r) => !("user_id" in r)),
  );

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anon.from("favorite_characters").select("person_id").limit(1);
  check("da sloggato la tabella è chiusa", anonRead.error != null, anonRead.error?.code ?? "nessun errore!");
  const anonRpc = await anon.rpc("character_vote_counts", { t_id: T.title_id, t_type: T.media_type });
  check("da sloggato l'RPC è chiusa", anonRpc.error != null, anonRpc.error?.code ?? "nessun errore!");

  const del = await a.client.from("favorite_characters").delete().eq("user_id", a.id).eq("title_id", T.title_id).eq("media_type", T.media_type).select("person_id");
  check("si toglie il proprio voto", !del.error && del.data?.length === 1, del.error?.message);

  const delAltrui = await a.client.from("favorite_characters").delete().eq("user_id", b.id).select("person_id");
  check("non si toglie il voto di un altro", (delAltrui.data ?? []).length === 0, delAltrui.error?.message ?? "0 righe");
} catch (e) {
  esiti.push(`  KO  eccezione — ${e.message ?? e}`);
} finally {
  for (const id of uids) await admin.auth.admin.deleteUser(id);
}

console.log(esiti.join("\n"));
process.exit(esiti.some((r) => r.startsWith("  KO")) ? 1 : 0);
