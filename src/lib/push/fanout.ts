import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { romeDateString } from "@/lib/cinema/dates";
import {
  PUSH_BATCH,
  PUSH_NOTIFICATIONS_PER_RUN,
  PUSH_RECEIPT_DELAY_MIN,
} from "@/lib/config";
import type { Json } from "@/types/database";
import { composePush } from "./compose";
import { getExpoReceipts, sendExpoMessages, type ExpoMessage } from "./expo";
import { chunk, parseTickets, tokensToDelete } from "./tickets";

/**
 * Da una riga di `notifications` (o dalla domanda del giorno) al telefono.
 *
 * Tre lavori, chiamati dai job `push-send`, `push-daily` e `push-receipts`.
 * Girano col service client: `push_tokens` e `push_tickets` non sono leggibili
 * da `authenticated` (migration 0047), e queste funzioni leggono notifiche di
 * utenti diversi dentro lo stesso giro.
 *
 * Due cose da sapere prima di toccare questo file:
 *
 * 1. **Il token push sta appeso al dispositivo, non all'utente.** Si arriva al
 *    destinatario per `device_members(user_id) → devices(non revocato) →
 *    push_tokens`, e un dispositivo puo' in teoria avere piu' membri: i
 *    messaggi si deduplicano per `expo_token`, altrimenti lo stesso telefono
 *    suonerebbe due volte per la stessa notifica.
 * 2. **`pushed_at` si scrive per tutte le righe lette**, anche per quelle
 *    scartate o senza nessun telefono: la colonna vuol dire "valutata", non
 *    "consegnata". Se restasse vuota, ogni giro futuro rileggerebbe le stesse
 *    righe e la coda non si svuoterebbe mai. L'unico caso in cui non si scrive
 *    e' l'errore di rete di Expo: li' si rilancia, il job registra il guasto e
 *    il cron riprova con le stesse righe.
 */

type Supabase = ReturnType<typeof createServiceClient>;

/** Token push di un dispositivo, con la chiave della riga per aggiornarlo dopo. */
interface TokenRiga {
  id: string;
  expoToken: string;
}

/**
 * Quanti token si leggono per la domanda del giorno: è un invio a tutti, e un
 * limite esplicito è meglio del tetto implicito di PostgREST (1000 righe).
 */
const DAILY_MAX_TOKENS = 2000;

/** Il payload di una notifica è `Json`: qui serve come oggetto, o niente. */
function oggetto(payload: Json | null): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
}

/** `in(...)` finisce nella query string: oltre un certo numero di id l'URL non regge. */
async function aPezzi<T>(items: T[], fn: (lotto: T[]) => Promise<void>): Promise<void> {
  for (const lotto of chunk(items, PUSH_BATCH)) await fn(lotto);
}

/**
 * I token push di ogni utente indicato. Due query: i dispositivi non revocati a
 * cui l'utente è iscritto, poi i loro token.
 */
async function tokenPerUtente(
  supabase: Supabase,
  userIds: string[],
): Promise<Map<string, TokenRiga[]>> {
  const out = new Map<string, TokenRiga[]>();
  if (userIds.length === 0) return out;

  const { data: membri, error } = await supabase
    .from("device_members")
    .select("user_id, device_id, devices!inner(revoked_at)")
    .in("user_id", userIds)
    .is("devices.revoked_at", null);
  if (error) throw new Error(`dispositivi dei destinatari: ${error.message}`);

  const deviceIds = [...new Set((membri ?? []).map((m) => m.device_id))];
  if (deviceIds.length === 0) return out;

  const { data: tokens, error: erroreToken } = await supabase
    .from("push_tokens")
    .select("id, expo_token, device_id")
    .in("device_id", deviceIds);
  if (erroreToken) throw new Error(`token push: ${erroreToken.message}`);

  const perDispositivo = new Map<string, TokenRiga[]>();
  for (const t of tokens ?? []) {
    const elenco = perDispositivo.get(t.device_id) ?? [];
    elenco.push({ id: t.id, expoToken: t.expo_token });
    perDispositivo.set(t.device_id, elenco);
  }
  for (const m of membri ?? []) {
    const suoi = perDispositivo.get(m.device_id);
    if (!suoi) continue;
    out.set(m.user_id, [...(out.get(m.user_id) ?? []), ...suoi]);
  }
  return out;
}

/** Un messaggio pronto, con la riga di `push_tokens` da cui è nato. */
interface DaInviare {
  tokenId: string;
  message: ExpoMessage;
}

/**
 * Spedisce a lotti da 100 e mette a posto le conseguenze: biglietti da
 * controllare più tardi, token morti da cancellare subito, altri errori
 * annotati su `last_error`. Se Expo non risponde **lancia**: chi chiama non
 * deve marcare niente come spinto.
 */
async function inviaLotti(supabase: Supabase, messaggi: DaInviare[]): Promise<void> {
  for (const lotto of chunk(messaggi, PUSH_BATCH)) {
    const risposta = await sendExpoMessages(lotto.map((m) => m.message));
    const esito = parseTickets(
      risposta,
      lotto.map((m) => ({ tokenId: m.tokenId })),
    );
    if (!Array.isArray(esito)) {
      // Expo ha risposto, ma con un errore di richiesta: il lotto è perso e non
      // si riprova (le notifiche restano comunque in-app). Nel log il motivo,
      // mai i token.
      console.error(`[push] lotto rifiutato da Expo: ${esito.error}`);
      continue;
    }

    const biglietti = esito
      .filter((t) => t.ticketId !== "")
      .map((t) => ({ ticket_id: t.ticketId, token_id: t.tokenId }));
    if (biglietti.length > 0) {
      // `upsert`: se Expo ripetesse un id di biglietto, la chiave primaria
      // farebbe fallire l'intero lotto invece di un solo biglietto.
      const { error } = await supabase
        .from("push_tickets")
        .upsert(biglietti, { onConflict: "ticket_id" });
      // Non è fatale: si perde solo il controllo della ricevuta.
      if (error) console.error(`[push] biglietti non salvati: ${error.message}`);
    }

    const morti = esito
      .filter((t) => t.errore === "DeviceNotRegistered")
      .map((t) => t.tokenId);
    if (morti.length > 0) {
      const { error } = await supabase.from("push_tokens").delete().in("id", morti);
      if (error) console.error(`[push] token morti non cancellati: ${error.message}`);
    }

    // Gli altri errori non dicono che il telefono è sparito (quota, messaggio
    // troppo grande, credenziali): il token resta, il motivo si annota.
    const altri = esito.filter((t) => t.errore && t.errore !== "DeviceNotRegistered");
    for (const motivo of new Set(altri.map((t) => t.errore ?? ""))) {
      const ids = altri.filter((t) => t.errore === motivo).map((t) => t.tokenId);
      const { error } = await supabase
        .from("push_tokens")
        .update({ last_error: motivo.slice(0, 300) })
        .in("id", ids);
      if (error) console.error(`[push] last_error non scritto: ${error.message}`);
    }
  }
}

/**
 * Le notifiche in-app non ancora spinte diventano push. Chiamata dal job
 * `push-send`: dal trigger a ogni riga nuova e dal cron ogni 5 minuti.
 */
export async function drainNotifications(): Promise<{
  inviate: number;
  senzaToken: number;
  scartate: number;
}> {
  const supabase = createServiceClient();

  const { data: righe, error } = await supabase
    .from("notifications")
    .select("id, user_id, kind, payload")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(PUSH_NOTIFICATIONS_PER_RUN);
  if (error) throw new Error(`notifiche da spingere: ${error.message}`);
  if (!righe || righe.length === 0) return { inviate: 0, senzaToken: 0, scartate: 0 };

  // Mittenti e titoli citati: una query ciascuna, come fa la pagina delle notifiche.
  const userIds = new Set<string>();
  const titleIds = new Set<number>();
  for (const n of righe) {
    const p = oggetto(n.payload);
    if (typeof p.from_user === "string") userIds.add(p.from_user);
    if (typeof p.title_id === "number") titleIds.add(p.title_id);
  }

  const nomi = new Map<string, string>();
  if (userIds.size > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", [...userIds]);
    for (const p of data ?? []) nomi.set(p.id, p.display_name ?? p.username);
  }

  const titoli = new Map<string, string>();
  if (titleIds.size > 0) {
    const { data } = await supabase
      .from("titles")
      .select("id, media_type, title")
      .in("id", [...titleIds]);
    for (const t of data ?? []) titoli.set(`${t.media_type}-${t.id}`, t.title);
  }

  const destinatari = [...new Set(righe.map((r) => r.user_id))];
  const token = await tokenPerUtente(supabase, destinatari);

  // Il pallino sull'icona: una query per destinatario **che ha un telefono**,
  // non una per notifica. Chi riceve tre notifiche in questo giro se le vede
  // arrivare tutte con lo stesso numero: è il conteggio di adesso, e la riga
  // successiva lo aggiorna comunque.
  const badge = new Map<string, number>();
  for (const uid of destinatari) {
    if ((token.get(uid) ?? []).length === 0) continue;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .is("read_at", null);
    badge.set(uid, count ?? 0);
  }

  let inviate = 0;
  let senzaToken = 0;
  let scartate = 0;
  const messaggi: DaInviare[] = [];

  for (const riga of righe) {
    const p = oggetto(riga.payload);
    const from = typeof p.from_user === "string" ? nomi.get(p.from_user) : undefined;
    const titolo =
      typeof p.title_id === "number"
        ? (titoli.get(`${p.media_type}-${p.title_id}`) ??
          titoli.get(`movie-${p.title_id}`) ??
          titoli.get(`tv-${p.title_id}`))
        : undefined;

    const messaggio = composePush(riga.kind, p, { fromUser: from, titolo });
    if (!messaggio) {
      scartate++;
      continue;
    }
    const suoi = token.get(riga.user_id) ?? [];
    if (suoi.length === 0) {
      senzaToken++;
      continue;
    }

    const visti = new Set<string>();
    for (const t of suoi) {
      if (visti.has(t.expoToken)) continue;
      visti.add(t.expoToken);
      messaggi.push({
        tokenId: t.id,
        message: {
          to: t.expoToken,
          title: messaggio.title,
          body: messaggio.body,
          data: { path: messaggio.path },
          badge: badge.get(riga.user_id),
          sound: "default",
          channelId: "default",
        },
      });
    }
    inviate++;
  }

  // Prima si spedisce: se Expo non risponde, l'errore esce di qui e le righe
  // restano da spingere per il giro dopo.
  await inviaLotti(supabase, messaggi);

  const adesso = new Date().toISOString();
  await aPezzi(
    righe.map((r) => r.id),
    async (lotto) => {
      const { error: erroreMarca } = await supabase
        .from("notifications")
        .update({ pushed_at: adesso })
        .in("id", lotto);
      if (erroreMarca) throw new Error(`pushed_at: ${erroreMarca.message}`);
    },
  );

  return { inviate, senzaToken, scartate };
}

/** Il testo della domanda in una riga di notifica. */
function tronca(testo: string, max: number): string {
  return testo.length <= max ? testo : `${testo.slice(0, max - 1).trimEnd()}…`;
}

/**
 * La domanda del giorno, una volta al mattino, **solo a chi non l'ha ancora
 * aperta**: chi ha già visto il popup non ha bisogno che il telefono glielo
 * ricordi. Niente badge: non è una notifica in-app e non sta nella lista.
 */
export async function pushDailyQuestion(): Promise<{ inviate: number }> {
  const supabase = createServiceClient();
  const oggi = romeDateString();

  const { data: domanda, error } = await supabase
    .from("daily_questions")
    .select("id, text")
    .eq("ask_on", oggi)
    .maybeSingle();
  if (error) throw new Error(`domanda del giorno: ${error.message}`);
  if (!domanda) return { inviate: 0 };

  const { data: tokens, error: erroreToken } = await supabase
    .from("push_tokens")
    .select("id, expo_token, device_id, devices!inner(revoked_at)")
    .is("devices.revoked_at", null)
    .limit(DAILY_MAX_TOKENS);
  if (erroreToken) throw new Error(`token push: ${erroreToken.message}`);
  if (!tokens || tokens.length === 0) return { inviate: 0 };

  const deviceIds = [...new Set(tokens.map((t) => t.device_id))];
  const membriPerDispositivo = new Map<string, string[]>();
  await aPezzi(deviceIds, async (lotto) => {
    const { data, error: erroreMembri } = await supabase
      .from("device_members")
      .select("user_id, device_id")
      .in("device_id", lotto);
    if (erroreMembri) throw new Error(`membri dei dispositivi: ${erroreMembri.message}`);
    for (const m of data ?? []) {
      membriPerDispositivo.set(m.device_id, [
        ...(membriPerDispositivo.get(m.device_id) ?? []),
        m.user_id,
      ]);
    }
  });

  const { data: viste, error: erroreViste } = await supabase
    .from("daily_question_views")
    .select("user_id")
    .eq("ask_on", oggi);
  if (erroreViste) throw new Error(`chi ha già aperto: ${erroreViste.message}`);
  const giaViste = new Set((viste ?? []).map((v) => v.user_id));

  const messaggi: DaInviare[] = [];
  const visti = new Set<string>();
  for (const t of tokens) {
    const membri = membriPerDispositivo.get(t.device_id) ?? [];
    // Un dispositivo senza membri non ha nessuno da avvisare; se ne ha più di
    // uno basta che a uno la domanda manchi ancora.
    if (!membri.some((u) => !giaViste.has(u))) continue;
    if (visti.has(t.expo_token)) continue;
    visti.add(t.expo_token);
    messaggi.push({
      tokenId: t.id,
      message: {
        to: t.expo_token,
        title: "La domanda del giorno",
        body: tronca(domanda.text, 180),
        data: { path: "/" },
        sound: "default",
        channelId: "default",
      },
    });
  }

  await inviaLotti(supabase, messaggi);
  return { inviate: messaggi.length };
}

/**
 * Le ricevute dei biglietti di un quarto d'ora fa. È l'unico posto in cui si
 * scopre che un'installazione è sparita **dopo** che Expo aveva accettato il
 * messaggio: la consegna ad Apple e Google avviene dopo la risposta.
 */
export async function processReceipts(): Promise<{
  cancellati: number;
  controllate: number;
}> {
  const supabase = createServiceClient();
  const soglia = new Date(Date.now() - PUSH_RECEIPT_DELAY_MIN * 60_000).toISOString();

  const { data: biglietti, error } = await supabase
    .from("push_tickets")
    .select("ticket_id, token_id")
    .lt("created_at", soglia)
    .limit(1000);
  if (error) throw new Error(`biglietti da controllare: ${error.message}`);
  if (!biglietti || biglietti.length === 0) return { cancellati: 0, controllate: 0 };

  const tokenDelBiglietto = new Map(biglietti.map((b) => [b.ticket_id, b.token_id]));
  const daCancellare = new Set<string>();
  for (const lotto of chunk(biglietti, PUSH_BATCH)) {
    const risposta = await getExpoReceipts(lotto.map((b) => b.ticket_id));
    for (const ticketId of tokensToDelete(risposta)) {
      const tokenId = tokenDelBiglietto.get(ticketId);
      if (tokenId) daCancellare.add(tokenId);
    }
  }

  if (daCancellare.size > 0) {
    await aPezzi([...daCancellare], async (lotto) => {
      const { error: erroreDel } = await supabase
        .from("push_tokens")
        .delete()
        .in("id", lotto);
      if (erroreDel) throw new Error(`token da cancellare: ${erroreDel.message}`);
    });
  }

  // Controllati una volta, non servono più (quelli dei token appena cancellati
  // sono già spariti in cascata, ma cancellarli di nuovo non fa danno).
  await aPezzi(
    biglietti.map((b) => b.ticket_id),
    async (lotto) => {
      const { error: erroreDel } = await supabase
        .from("push_tickets")
        .delete()
        .in("ticket_id", lotto);
      if (erroreDel) throw new Error(`biglietti da cancellare: ${erroreDel.message}`);
    },
  );

  return { cancellati: daCancellare.size, controllate: biglietti.length };
}
