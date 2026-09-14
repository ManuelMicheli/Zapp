/**
 * Banco delle regole di `favorite_people` (migration 0054 e 0055): con la
 * sessione di un utente vero (chiave anon, cioè quello che ha il browser) si
 * prova ciò che deve riuscire — mettere un proprio preferito e rileggerlo,
 * toglierlo, leggere i preferiti di un amico — e ciò che non deve: inserire a
 * nome di un altro, leggere i preferiti di un estraneo, cancellare il
 * preferito di un altro, modificare una riga (non c'è policy di update), i
 * vincoli di lunghezza/dominio (0055) e la chiave primaria che nega la doppia
 * riga sulla stessa persona.
 *
 * Crea due utenti finti sul progetto vero, li rende amici e li cancella in
 * fondo (i preferiti cadono in cascata con l'utente).
 *
 *   node scripts/people-check.mjs
 *
 * Da rilanciare a ogni modifica delle policy di `favorite_people`.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const uids = [];
const esiti = [];
function check(nome, ok, dettaglio = "") {
  esiti.push(`${ok ? "  ok  " : "  KO  "} ${nome}${dettaglio ? " — " + dettaglio : ""}`);
}

async function utente(tag) {
  const email = `zapp.people.${tag}.${Date.now()}@example.com`;
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

  // amicizia accettata: una riga sola basta, my_friend_ids() la vede da
  // entrambi i lati (union su requester e su addressee).
  const amicizia = await admin
    .from("friendships")
    .insert({ requester_id: a.id, addressee_id: b.id, status: "accepted" });
  if (amicizia.error) throw amicizia.error;

  // --- inserimento e lettura del proprio preferito ---
  const ins = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 3894, name: "Christopher Nolan", role: "Regia" })
    .select("person_id, name, role");
  check("si mette un proprio preferito", !ins.error && ins.data?.length === 1, ins.error?.message);

  const rilettura = await a.client
    .from("favorite_people")
    .select("person_id, name, role")
    .eq("user_id", a.id)
    .eq("person_id", 3894);
  check(
    "il proprio preferito si rilegge",
    (rilettura.data ?? []).length === 1 && rilettura.data[0].name === "Christopher Nolan",
    rilettura.error?.message ?? JSON.stringify(rilettura.data),
  );

  // --- non si inserisce a nome di un altro ---
  const altrui = await a.client
    .from("favorite_people")
    .insert({ user_id: b.id, person_id: 3894, name: "Christopher Nolan", role: "Regia" });
  check("non si inserisce a nome di un altro", altrui.error != null, altrui.error?.code ?? "nessun errore!");

  // --- amico: il secondo utente mette un preferito e diventa leggibile dal primo ---
  const insB = await b.client
    .from("favorite_people")
    .insert({ user_id: b.id, person_id: 6193, name: "Leonardo DiCaprio", role: "Cast" });
  check("l'amico mette il suo preferito", !insB.error, insB.error?.message);

  const vediAmico = await a.client
    .from("favorite_people")
    .select("person_id, name")
    .eq("user_id", b.id);
  check(
    "si leggono i preferiti di un amico",
    (vediAmico.data ?? []).length === 1 && vediAmico.data[0].person_id === 6193,
    vediAmico.error?.message ?? `${(vediAmico.data ?? []).length} righe`,
  );

  // --- estraneo: nessuna amicizia, la select torna vuota, non un errore ---
  const c = await utente("c");
  const insC = await c.client
    .from("favorite_people")
    .insert({ user_id: c.id, person_id: 1245, name: "Scarlett Johansson", role: "Cast" });
  check("l'estraneo mette il suo preferito", !insC.error, insC.error?.message);

  const vediEstraneo = await a.client
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", c.id);
  check(
    "l'estraneo non si legge: elenco vuoto, non errore",
    vediEstraneo.error == null && (vediEstraneo.data ?? []).length === 0,
    vediEstraneo.error?.message ?? `${(vediEstraneo.data ?? []).length} righe`,
  );

  // --- non si modifica (nessuna policy di update) ---
  const modifica = await a.client
    .from("favorite_people")
    .update({ name: "Nome cambiato" })
    .eq("user_id", a.id)
    .eq("person_id", 3894)
    .select("name");
  check(
    "non si modifica una riga esistente",
    (modifica.data ?? []).length === 0,
    modifica.error?.message ?? `${(modifica.data ?? []).length} righe aggiornate`,
  );
  const invariato = await admin
    .from("favorite_people")
    .select("name")
    .eq("user_id", a.id)
    .eq("person_id", 3894)
    .maybeSingle();
  check(
    "il nome non è cambiato davvero",
    invariato.data?.name === "Christopher Nolan",
    invariato.data?.name,
  );

  // --- vincoli di 0055 ---
  const nomeVuoto = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 111, name: "", role: "Cast" });
  check("un nome vuoto è respinto", nomeVuoto.error != null, nomeVuoto.error?.code ?? "nessun errore!");

  const nomeLungo = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 112, name: "x".repeat(201), role: "Cast" });
  check(
    "un nome da 201 caratteri è respinto",
    nomeLungo.error != null,
    nomeLungo.error?.code ?? "nessun errore!",
  );

  const idZero = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 0, name: "Persona a zero", role: "Cast" });
  check(
    "un person_id a zero è respinto",
    idZero.error != null,
    idZero.error?.code ?? "nessun errore!",
  );

  const idNegativo = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: -5, name: "Persona negativa", role: "Cast" });
  check(
    "un person_id negativo è respinto",
    idNegativo.error != null,
    idNegativo.error?.code ?? "nessun errore!",
  );

  // --- chiave primaria: due inserimenti della stessa persona confliggono ---
  const doppio = await a.client
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 3894, name: "Christopher Nolan di nuovo", role: "Regia" });
  check(
    "la stessa persona due volte dà conflitto, non due righe",
    doppio.error != null && doppio.error.code === "23505",
    doppio.error?.code ?? "nessun errore!",
  );
  const righeNolan = await admin
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", a.id)
    .eq("person_id", 3894);
  check(
    "resta una riga sola per quella persona",
    (righeNolan.data ?? []).length === 1,
    `${(righeNolan.data ?? []).length} righe`,
  );

  // --- da sloggato ---
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anon.from("favorite_people").select("person_id").limit(1);
  check("da sloggato la select è chiusa", anonRead.error != null, anonRead.error?.code ?? "nessun errore!");
  const anonInsert = await anon
    .from("favorite_people")
    .insert({ user_id: a.id, person_id: 999, name: "Prova", role: "Cast" });
  check(
    "da sloggato l'insert è chiuso",
    anonInsert.error != null,
    anonInsert.error?.code ?? "nessun errore!",
  );
  const anonDelete = await anon
    .from("favorite_people")
    .delete()
    .eq("user_id", a.id)
    .eq("person_id", 3894)
    .select("person_id");
  check(
    "da sloggato il delete non cancella nulla",
    (anonDelete.data ?? []).length === 0,
    anonDelete.error?.message ?? `${(anonDelete.data ?? []).length} righe`,
  );

  // --- non si cancella il preferito di un altro ---
  const delAltrui = await a.client
    .from("favorite_people")
    .delete()
    .eq("user_id", b.id)
    .select("person_id");
  check(
    "non si cancella il preferito di un altro",
    (delAltrui.data ?? []).length === 0,
    delAltrui.error?.message ?? `${(delAltrui.data ?? []).length} righe`,
  );
  const restaAncora = await admin.from("favorite_people").select("person_id").eq("user_id", b.id);
  check(
    "il preferito dell'altro c'è ancora",
    (restaAncora.data ?? []).length === 1,
    `${(restaAncora.data ?? []).length} righe`,
  );

  // --- si toglie il proprio preferito ---
  const del = await a.client
    .from("favorite_people")
    .delete()
    .eq("user_id", a.id)
    .eq("person_id", 3894)
    .select("person_id");
  check("si toglie il proprio preferito", !del.error && del.data?.length === 1, del.error?.message);
} catch (e) {
  esiti.push(`  KO  eccezione — ${e.message ?? e}`);
} finally {
  let pulito = true;
  for (const id of uids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      pulito = false;
      esiti.push(`  KO  pulizia utente ${id} fallita — ${error.message}`);
    }
  }
  if (!pulito) {
    console.error("ATTENZIONE: la pulizia degli utenti finti non è riuscita del tutto, controllare a mano.");
  }
}

console.log(esiti.join("\n"));
process.exit(esiti.some((r) => r.startsWith("  KO")) ? 1 : 0);
