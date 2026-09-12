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

async function post(url: string, body: unknown, cosa: string): Promise<unknown> {
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
    if (res.status !== 200) {
      // Il corpo dell'errore cita il token che l'ha causato: si toglie prima che
      // il messaggio finisca in `job_runs.detail` e nel log della funzione.
      throw new Error(
        `Expo ${cosa}: HTTP ${res.status} ${nascondiToken(testo.slice(0, 300))}`,
      );
    }
    try {
      return JSON.parse(testo);
    } catch {
      throw new Error(`Expo ${cosa}: risposta non JSON`);
    }
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
  return post(SEND_URL, messaggi, "invio");
}

/** Chiede le ricevute di un lotto di biglietti già inviati. */
export async function getExpoReceipts(ids: string[]): Promise<unknown> {
  return post(RECEIPTS_URL, { ids }, "ricevute");
}
