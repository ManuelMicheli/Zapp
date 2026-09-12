import "server-only";

import { nascondiToken } from "./tickets";

/**
 * Il pezzo di rete verso Expo Push (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * Due funzioni, nient'altro: fa la richiesta e restituisce il corpo **grezzo**.
 * A capirlo ci pensa `tickets.ts`, che è puro e collaudato; qui non si
 * interpreta niente, così non esiste un secondo posto dove una risposta storta
 * possa essere letta male.
 *
 * I token Expo non compaiono mai in un log: identificano un telefono, e un log
 * è un posto dove non devono finire nemmeno in caso di errore.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Oltre questo, la richiesta si abbandona: il job ha 60 s in tutto. */
const TIMEOUT_MS = 10_000;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { path: string };
  badge?: number;
  sound?: "default";
  channelId?: "default";
};

/**
 * `EXPO_ACCESS_TOKEN` è facoltativo: serve solo se sul progetto Expo è accesa
 * la "enhanced push security". Senza, Expo accetta comunque l'invio.
 */
function headers(): Record<string, string> {
  const base: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const token = process.env.EXPO_ACCESS_TOKEN;
  if (token) base.authorization = `Bearer ${token}`;
  return base;
}

async function post(
  url: string,
  body: unknown,
  cosa: string,
  /**
   * Se `true`, un 4xx con corpo JSON **non** è un'eccezione: si restituisce il
   * corpo, che `parseTickets` legge come rifiuto del lotto.
   *
   * Serve a non innescare una tempesta. Un 400 (richiesta malformata) o un 429
   * (troppi messaggi) lanciato come errore fa saltare tutto `drainNotifications`
   * **prima** che scriva `pushed_at`: le stesse 200 notifiche restano da
   * spingere, il cron ritorna fra 5 minuti, rimanda gli stessi lotti — compresi
   * quelli che Expo aveva già accettato — e sotto rate limit la cosa si avvita
   * su se stessa. Un 4xx è un giudizio di Expo su quella richiesta: ripeterla
   * uguale non la fa passare, quindi si prende atto, si annota e si va avanti.
   * I 5xx (guasto passeggero dalla parte di Expo), la rete e le risposte non
   * JSON restano eccezioni: quelle sì che vanno ritentate.
   */
  tolleraRifiuto = false,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    // Il corpo si legge **anche** quando lo stato non è 200: è lì che Expo
    // spiega perché (`errors[0].message`), e senza quel testo un 400 non si
    // distingue da un altro.
    const testo = await res.text();
    let corpo: unknown;
    let jsonValido = true;
    try {
      corpo = JSON.parse(testo);
    } catch {
      jsonValido = false;
    }

    if (res.status === 200) {
      if (!jsonValido) throw new Error(`Expo ${cosa}: risposta non JSON`);
      return corpo;
    }
    const rifiuto = res.status >= 400 && res.status < 500;
    if (rifiuto && jsonValido && tolleraRifiuto) return corpo;

    // Il corpo dell'errore cita il token che l'ha causato: si nasconde **prima**
    // di troncare, altrimenti un taglio a metà parentesi lo lascerebbe passare.
    throw new Error(
      `Expo ${cosa}: HTTP ${res.status} ${nascondiToken(testo).slice(0, 300)}`,
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Expo ${cosa}: nessuna risposta in ${TIMEOUT_MS / 1000} s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Invia un lotto (al massimo 100 messaggi: il taglio lo fa chi chiama, con `chunk`). */
export async function sendExpoMessages(messaggi: ExpoMessage[]): Promise<unknown> {
  return post(SEND_URL, messaggi, "invio", true);
}

/**
 * Chiede le ricevute di un lotto di biglietti già inviati.
 *
 * Qui un 4xx **lancia**, al contrario dell'invio: le ricevute non hanno niente
 * da mandare avanti, e far finta che la risposta sia vuota vorrebbe dire
 * cancellare i biglietti senza averli controllati, perdendo per sempre
 * l'occasione di scoprire un token morto. Meglio un giro fallito nel registro e
 * il cron che riprova fra mezz'ora: qui non si rispinge niente, quindi non c'è
 * nessuna tempesta da evitare.
 */
export async function getExpoReceipts(ids: string[]): Promise<unknown> {
  return post(RECEIPTS_URL, { ids }, "ricevute");
}
