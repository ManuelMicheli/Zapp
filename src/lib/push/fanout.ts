import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { romeDateString, romeIso } from "@/lib/cinema/dates";
import {
  DB_IN_CHUNK,
  PUSH_BATCH,
  PUSH_NOTIFICATIONS_PER_RUN,
  PUSH_RECEIPT_DELAY_MIN,
} from "@/lib/config";
import type { Json } from "@/types/database";
import { composePush } from "./compose";
import { getExpoReceipts, sendExpoMessages, type ExpoMessage } from "./expo";
import { chunk, nascondiToken, parseTickets, tokensToDelete } from "./tickets";

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
 *    e' il guasto di rete (o un 5xx) di Expo: li' si rilancia, il job registra
 *    il guasto e il cron riprova con le stesse righe. Un rifiuto 4xx **non**
 *    rilancia — vedi `expo.ts`, e' la differenza fra "riprova" e "tempesta".
 * 3. **Un guasto di rete a meta' strada rimanda i lotti gia' accettati.** I
 *    messaggi partono a lotti da 100 e `pushed_at` si scrive alla fine, una
 *    volta sola: se il terzo lotto non parte, al giro dopo ripartono anche il
 *    primo e il secondo, e chi era li' dentro riceve il push due volte. E' una
 *    scelta: il contrario (marcare prima di spedire) perderebbe dei push in
 *    silenzio, e un doppione si nota mentre un push mancato no. Il danno e'
 *    limitato a `PUSH_NOTIFICATIONS_PER_RUN` righe e capita solo se Expo cade a
 *    meta' di un giro. Marcare lotto per lotto vorrebbe dire tenere il legame
 *    "quale notifica sta in quale lotto" (una notifica puo' avere piu'
 *    telefoni, quindi piu' lotti): si fara' se i doppioni si vedranno davvero.
 */

type Supabase = ReturnType<typeof createServiceClient>;

/** Token push di un dispositivo, con la chiave della riga per aggiornarlo dopo. */
interface TokenRiga {
  id: string;
  expoToken: string;
}

/**
 * Quanti token si leggono per la domanda del giorno: è un invio a tutti, e un
 * limite esplicito è meglio del tetto implicito di PostgREST.
 *
 * **Mille, non duemila**: PostgREST taglia comunque a 1000 righe, quindi un
 * tetto più alto non leggeva un token in più e rendeva la spia `tetto` qui
 * sotto impossibile da accendere — il taglio in silenzio restava, sparita solo
 * la riga che doveva dirlo. Quando i telefoni registrati supereranno il
 * migliaio la lettura andrà paginata con `.range()`; per ora il tetto si vede
 * nel registro dei job ed è il segnale che quel giorno è arrivato.
 */
const DAILY_MAX_TOKENS = 1000;

/** Quanti motivi distinti di rifiuto si riportano: servono a capire, non a contare. */
const MOTIVI_MAX = 5;

/** Il payload di una notifica è `Json`: qui serve come oggetto, o niente. */
function oggetto(payload: Json | null): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
}

/**
 * `in(...)` finisce nella query string: oltre un certo numero di id l'URL non
 * regge. Il taglio è `DB_IN_CHUNK`, non `PUSH_BATCH`: quello è il limite di
 * Expo e qui non si spedisce niente, si interroga il database.
 */
async function aPezzi<T>(items: T[], fn: (lotto: T[]) => Promise<void>): Promise<void> {
  for (const lotto of chunk(items, DB_IN_CHUNK)) await fn(lotto);
}

/** Come `aPezzi`, ma per una lettura: rimette insieme le righe di ogni lotto. */
async function leggiAPezzi<T, R>(
  items: T[],
  fn: (lotto: T[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  for (const lotto of chunk(items, DB_IN_CHUNK)) out.push(...(await fn(lotto)));
  return out;
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

  const membri = await leggiAPezzi(userIds, async (lotto) => {
    const { data, error } = await supabase
      .from("device_members")
      .select("user_id, device_id, devices!inner(revoked_at)")
      .in("user_id", lotto)
      .is("devices.revoked_at", null);
    if (error) throw new Error(`dispositivi dei destinatari: ${error.message}`);
    return data ?? [];
  });

  const deviceIds = [...new Set(membri.map((m) => m.device_id))];
  if (deviceIds.length === 0) return out;

  const tokens = await leggiAPezzi(deviceIds, async (lotto) => {
    const { data, error } = await supabase
      .from("push_tokens")
      .select("id, expo_token, device_id")
      .in("device_id", lotto);
    if (error) throw new Error(`token push: ${error.message}`);
    return data ?? [];
  });

  const perDispositivo = new Map<string, TokenRiga[]>();
  for (const t of tokens) {
    const elenco = perDispositivo.get(t.device_id) ?? [];
    elenco.push({ id: t.id, expoToken: t.expo_token });
    perDispositivo.set(t.device_id, elenco);
  }
  for (const m of membri) {
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

/** Quanti messaggi Expo ha rifiutato in blocco, e perché. */
interface EsitoInvio {
  rifiutati: number;
  motivi: string[];
}

/**
 * Spedisce a lotti da 100 e mette a posto le conseguenze: biglietti da
 * controllare più tardi, token morti da cancellare subito, altri errori
 * annotati su `last_error`. Se Expo non risponde **lancia**: chi chiama non
 * deve marcare niente come spinto.
 *
 * Restituisce i lotti rifiutati in blocco (un 4xx di Expo: il lotto è perso e
 * non si riprova, vedi `expo.ts`). Erano visibili **solo** in un
 * `console.error`: nel registro dei job il giro risultava identico a uno
 * perfettamente riuscito, e un errore di credenziali o una quota esaurita
 * potevano bruciare ogni push per giorni senza lasciare una traccia
 * consultabile. Ora il numero e i motivi finiscono in `job_runs.detail`.
 */
async function inviaLotti(
  supabase: Supabase,
  messaggi: DaInviare[],
): Promise<EsitoInvio> {
  let rifiutati = 0;
  // Distinti: cento lotti rifiutati dallo stesso 429 sono un motivo solo.
  const motivi = new Set<string>();

  for (const lotto of chunk(messaggi, PUSH_BATCH)) {
    const risposta = await sendExpoMessages(lotto.map((m) => m.message));
    const esito = parseTickets(
      risposta,
      lotto.map((m) => ({ tokenId: m.tokenId })),
    );
    if (!Array.isArray(esito)) {
      // Expo ha risposto, ma con un errore di richiesta: il lotto è perso e non
      // si riprova (le notifiche restano comunque in-app). Nel log il motivo,
      // mai i token: `parseTickets` li toglie già, `nascondiToken` qui è la
      // seconda rete — questo testo esce anche dalla risposta del job.
      const motivo = nascondiToken(esito.error).slice(0, 300);
      rifiutati += lotto.length;
      if (motivi.size < MOTIVI_MAX) motivi.add(motivo);
      console.error(`[push] lotto rifiutato da Expo: ${motivo}`);
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

  return { rifiutati, motivi: [...motivi] };
}

/**
 * Le notifiche in-app non ancora spinte diventano push. Chiamata dal job
 * `push-send`: dal trigger a ogni insert (per **istruzione**, migration
 * `0048_push_wake_statement.sql`) e dal cron ogni 5 minuti.
 *
 * Le due unità non sono la stessa cosa e prima lo erano per sbaglio:
 * `notifiche` sono le righe di `notifications` con almeno un telefono a cui
 * mandarle, `inviate` sono i **messaggi** accettati da Expo (una notifica a
 * chi ha due telefoni è una notifica e due messaggi). `pushDailyQuestion`
 * conta `inviate` allo stesso modo: due numeri con lo stesso nome e due
 * significati diversi nello stesso registro non si possono confrontare.
 */
export async function drainNotifications(): Promise<{
  inviate: number;
  notifiche: number;
  senzaToken: number;
  scartate: number;
  rifiutati: number;
  motivi: string[];
}> {
  const supabase = createServiceClient();

  const { data: righe, error } = await supabase
    .from("notifications")
    .select("id, user_id, kind, payload")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(PUSH_NOTIFICATIONS_PER_RUN);
  if (error) throw new Error(`notifiche da spingere: ${error.message}`);
  if (!righe || righe.length === 0) {
    return {
      inviate: 0,
      notifiche: 0,
      senzaToken: 0,
      scartate: 0,
      rifiutati: 0,
      motivi: [],
    };
  }

  // Mittenti e titoli citati: una query ciascuna, come fa la pagina delle notifiche.
  const userIds = new Set<string>();
  const titleIds = new Set<number>();
  for (const n of righe) {
    const p = oggetto(n.payload);
    if (typeof p.from_user === "string") userIds.add(p.from_user);
    if (typeof p.title_id === "number") titleIds.add(p.title_id);
  }

  const nomi = new Map<string, string>();
  const profili = await leggiAPezzi([...userIds], async (lotto) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", lotto);
    return data ?? [];
  });
  for (const p of profili) nomi.set(p.id, p.display_name ?? p.username);

  const titoli = new Map<string, string>();
  const righeTitoli = await leggiAPezzi([...titleIds], async (lotto) => {
    const { data } = await supabase
      .from("titles")
      .select("id, media_type, title")
      .in("id", lotto);
    return data ?? [];
  });
  for (const t of righeTitoli) titoli.set(`${t.media_type}-${t.id}`, t.title);

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

  let notifiche = 0;
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
    notifiche++;
  }

  // Prima si spedisce: se Expo non risponde, l'errore esce di qui e le righe
  // restano da spingere per il giro dopo.
  const { rifiutati, motivi } = await inviaLotti(supabase, messaggi);

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

  // `inviate` sono i messaggi che Expo ha preso in carico: quelli dei lotti
  // rifiutati stanno in `rifiutati` e non vanno contati due volte.
  return {
    inviate: messaggi.length - rifiutati,
    notifiche,
    senzaToken,
    scartate,
    rifiutati,
    motivi,
  };
}

/** Il testo della domanda in una riga di notifica. */
function tronca(testo: string, max: number): string {
  return testo.length <= max ? testo : `${testo.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Un giro di `push-daily` è già andato a buon fine oggi (data di Roma)?
 *
 * `pushed_at` protegge le notifiche in-app dai doppioni, ma la domanda del
 * giorno non passa da `notifications`: niente la tratteneva. Una seconda
 * chiamata del job — il cron che gira due volte per un riavvio, un `POST
 * /api/jobs/push-daily` a mano durante una verifica — avrebbe svegliato ogni
 * telefono una seconda volta con la stessa domanda. Il registro dei job è la
 * memoria che serve, e `job_runs_job_idx` è (job, started_at desc): la lettura
 * è un indice, non una scansione.
 *
 * Conta anche un giro riuscito che non ha trovato nessuna domanda: se una
 * domanda venisse creata **dopo** le 9 del mattino, quel giorno il push non
 * partirebbe. Le domande si programmano in anticipo (`ask_on`), quindi il caso
 * non esiste nella pratica; se un giorno esistesse, basta chiudere quel giro
 * nel registro per riaprire la strada.
 */
async function giaInviataOggi(supabase: Supabase, oggi: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("job_runs")
    .select("id")
    .eq("job", "push-daily")
    .eq("ok", true)
    .gte("started_at", romeIso(oggi, "00:00"))
    .limit(1);
  // Un registro illeggibile non deve impedire il push del mattino: si prosegue
  // (un doppione è meno grave di una domanda mai arrivata) e lo si dice nel log.
  if (error) {
    console.error(`[push] giri di push-daily di oggi: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * La domanda del giorno, una volta al mattino, **solo a chi non l'ha ancora
 * aperta**: chi ha già visto il popup non ha bisogno che il telefono glielo
 * ricordi. Niente badge: non è una notifica in-app e non sta nella lista.
 *
 * `inviate` conta i **messaggi** accettati da Expo, come in
 * `drainNotifications`.
 */
export async function pushDailyQuestion(): Promise<{
  inviate: number;
  tetto?: boolean;
  saltato?: string;
  rifiutati?: number;
  motivi?: string[];
}> {
  const supabase = createServiceClient();
  const oggi = romeDateString();

  if (await giaInviataOggi(supabase, oggi)) {
    return { inviate: 0, saltato: "gia' inviata oggi" };
  }

  const { data: domanda, error } = await supabase
    .from("daily_questions")
    .select("id, text")
    .eq("ask_on", oggi)
    .maybeSingle();
  if (error) throw new Error(`domanda del giorno: ${error.message}`);
  if (!domanda) return { inviate: 0 };

  // Ordinati per data: se il tetto taglia, taglia sempre gli ultimi arrivati e
  // non un insieme casuale — così "chi manca" è una domanda con una risposta.
  const { data: tokens, error: erroreToken } = await supabase
    .from("push_tokens")
    .select("id, expo_token, device_id, devices!inner(revoked_at)")
    .is("devices.revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(DAILY_MAX_TOKENS);
  if (erroreToken) throw new Error(`token push: ${erroreToken.message}`);
  if (!tokens || tokens.length === 0) return { inviate: 0 };

  // Un tetto che taglia in silenzio è un guasto che non si vede: se i token
  // letti sono esattamente il massimo, ce ne sono quasi certamente altri, e
  // qualcuno oggi non riceve la domanda. Va detto nel log e nel registro dei job.
  const tetto = tokens.length === DAILY_MAX_TOKENS;
  if (tetto) console.warn("[push] tetto token giornalieri raggiunto");

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

  // Solo le viste **di questi utenti**, non tutte quelle di oggi: la tabella
  // cresce con l'utenza intera, e una lettura senza filtro si sarebbe fermata in
  // silenzio al tetto di PostgREST — con l'effetto che chi ha già aperto la
  // domanda riceve lo stesso il push. Filtrata e a pezzi, invece, è esatta.
  const utentiDeiToken = [...new Set([...membriPerDispositivo.values()].flat())];
  const viste = await leggiAPezzi(utentiDeiToken, async (lotto) => {
    const { data, error: erroreViste } = await supabase
      .from("daily_question_views")
      .select("user_id")
      .eq("ask_on", oggi)
      .in("user_id", lotto);
    if (erroreViste) throw new Error(`chi ha già aperto: ${erroreViste.message}`);
    return data ?? [];
  });
  const giaViste = new Set(viste.map((v) => v.user_id));

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

  const { rifiutati, motivi } = await inviaLotti(supabase, messaggi);
  return {
    inviate: messaggi.length - rifiutati,
    ...(tetto ? { tetto } : {}),
    ...(rifiutati > 0 ? { rifiutati, motivi } : {}),
  };
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

  // Dal più vecchio: le ricevute di Expo scadono (24 h), quindi se i biglietti
  // sono più di mille per giro i primi a essere controllati devono essere quelli
  // che stanno per sparire, non un mille qualsiasi.
  const { data: biglietti, error } = await supabase
    .from("push_tickets")
    .select("ticket_id, token_id")
    .lt("created_at", soglia)
    .order("created_at", { ascending: true })
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
