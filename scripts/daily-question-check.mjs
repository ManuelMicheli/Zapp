/**
 * Banco delle regole della domanda del giorno: con la sessione di un utente vero
 * (chiave anon, cioè quello che ha il browser) si tenta ciò che non deve
 * riuscire — riscrivere la risposta di ieri, rispondere a una domanda vecchia,
 * rispondere al posto di un altro, sfogliare le domande future, leggere il podio
 * di oggi, toccare `report_count`.
 *
 * Crea utenti e una domanda finti sul progetto vero e li cancella in fondo
 * (le risposte cadono in cascata con l'utente).
 *
 *   node scripts/daily-question-check.mjs
 *
 * Da rilanciare a ogni modifica delle policy di `daily_answers`/`daily_questions`.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rome = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
const oggi = rome(new Date());
const ieri = rome(new Date(Date.now() - 86400000));
const domani = rome(new Date(Date.now() + 86400000));

const uids = [];
let qIeri = null;
let answerId = null;
const esiti = [];
function check(nome, ok, dettaglio = "") {
  esiti.push(`${ok ? "  ok  " : "  KO  "} ${nome}${dettaglio ? " — " + dettaglio : ""}`);
}

try {
  const { data: q, error: qe } = await admin
    .from("daily_questions")
    .insert({ ask_on: ieri, text: "Domanda di ieri, per la prova delle regole.", media_scope: "any" })
    .select("id").single();
  if (qe) throw qe;
  qIeri = q.id;

  const email = `zapp.rls.${Date.now()}@example.com`;
  const password = "Prova-rls-2026!";
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) throw ue;
  uids.push(u.user.id);
  await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", u.user.id);

  const { data: a, error: ae } = await admin
    .from("daily_answers")
    .insert({ question_id: qIeri, user_id: u.user.id, title_id: 603, media_type: "movie", reason: "di ieri" })
    .select("id").single();
  if (ae) throw ae;
  answerId = a.id;

  // sessione utente, chiave anon: esattamente quello che ha il browser
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw se;

  const upd = await client.from("daily_answers").update({ reason: "riscritta oggi" }).eq("id", answerId).select("id");
  check("la risposta di ieri non si riscrive", (upd.data ?? []).length === 0, upd.error?.message ?? "0 righe");

  const del = await client.from("daily_answers").delete().eq("id", answerId).select("id");
  check("la risposta di ieri non si cancella", (del.data ?? []).length === 0, del.error?.message ?? "0 righe");

  const ins = await client.from("daily_answers").insert({ question_id: qIeri, user_id: u.user.id, title_id: 155, media_type: "movie" });
  check("non si risponde a una domanda vecchia", ins.error != null, ins.error?.code ?? "nessun errore!");

  const { data: altrui } = await admin.auth.admin.createUser({ email: `zapp.rls2.${Date.now()}@example.com`, password, email_confirm: true });
  uids.push(altrui.user.id);
  const insAltrui = await client.from("daily_answers").insert({ question_id: qIeri, user_id: altrui.user.id, title_id: 155, media_type: "movie" });
  check("non si risponde al posto di un altro", insAltrui.error != null, insAltrui.error?.code ?? "nessun errore!");

  await admin.from("daily_questions").insert({ ask_on: domani, text: "Domanda di domani, non si deve vedere.", media_scope: "any" }).select("id");
  const fut = await client.from("daily_questions").select("id").eq("ask_on", domani);
  check("le domande future non si leggono", (fut.data ?? []).length === 0, `${(fut.data ?? []).length} righe`);

  const podioOggi = await client.rpc("daily_question_podium", { day: oggi });
  check("il podio di oggi non si legge", (podioOggi.data ?? []).length === 0, podioOggi.error?.message ?? "0 righe");

  const podioIeri = await client.rpc("daily_question_podium", { day: ieri });
  check("il podio di ieri si legge", (podioIeri.data ?? []).length > 0, `${(podioIeri.data ?? []).length} righe`);

  // la prova su report_count va fatta su una risposta di OGGI: su quella di ieri
  // la policy blocca comunque e PostgREST risponde 0 righe senza errore
  const { data: qOggi } = await admin.from("daily_questions").select("id").eq("ask_on", oggi).maybeSingle();
  if (qOggi) {
    const insOggi = await client
      .from("daily_answers")
      .insert({ question_id: qOggi.id, user_id: u.user.id, title_id: 603, media_type: "movie", reason: "di oggi" })
      .select("id")
      .single();
    check("si risponde alla domanda di oggi", insOggi.error == null, insOggi.error?.message ?? "inserita");
    if (insOggi.data) {
      const ok = await client.from("daily_answers").update({ reason: "cambiata" }).eq("id", insOggi.data.id).select("id");
      check("la risposta di oggi si corregge", (ok.data ?? []).length === 1, ok.error?.message ?? "1 riga");
      const rc = await client.from("daily_answers").update({ report_count: 9 }).eq("id", insOggi.data.id).select("id");
      check("report_count non si tocca", rc.error != null, rc.error?.code ?? "nessun errore!");
    }
  } else {
    check("domanda di oggi presente", false, "nessuna domanda oggi, prova saltata");
  }
} finally {
  console.log(esiti.join("\n"));
  for (const id of uids) await admin.auth.admin.deleteUser(id);
  if (qIeri) await admin.from("daily_questions").delete().eq("id", qIeri);
  await admin.from("daily_questions").delete().eq("ask_on", domani).eq("text", "Domanda di domani, non si deve vedere.");
  console.log("pulito");
}
