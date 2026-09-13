/**
 * Lettura delle risposte di Expo: biglietti (`/push/send`) e ricevute
 * (`/push/getReceipts`).
 *
 * Sono dati di terze parti che arrivano dalla rete: qui non c'è un solo `as`.
 * Un cast direbbe al compilatore che la risposta ha la forma attesa senza che
 * nessuno l'abbia guardata, e la prima risposta storta (un 200 con un corpo di
 * errore, un campo rinominato) diventerebbe un `undefined` letto due funzioni
 * più in là — dove la traccia non dice più da dove veniva. Si controlla campo
 * per campo, e quello che non torna diventa un errore parlante.
 *
 * Modulo puro: nessun import, si collauda con Vitest.
 */

/** Divide in lotti (Expo accetta al massimo 100 messaggi per richiesta). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Biglietto letto: `ticketId` vuoto + `errore` se Expo ha già rifiutato l'invio. */
export interface Ticket {
  ticketId: string;
  tokenId: string;
  errore?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Toglie i token Expo da un testo destinato a un log o a una colonna di
 * diagnostica. Serve davvero: i messaggi d'errore di Expo **citano il token**
 * («"ExponentPushToken[…]" is not a valid Expo push token»), e quel testo
 * finisce in `push_tokens.last_error`, in `job_runs.detail` e nel log della
 * funzione. Un token push identifica un'installazione: non è roba da log.
 */
export function nascondiToken(testo: string): string {
  return testo.replace(/(Expo(?:nent)?PushToken)\[[^\]]*\]/g, "$1[…]");
}

/** Il motivo dell'errore: `details.error` di Expo, o il suo messaggio. */
function motivo(voce: Record<string, unknown>): string {
  const details = voce.details;
  if (isRecord(details) && typeof details.error === "string") return details.error;
  if (typeof voce.message === "string" && voce.message !== "") {
    return nascondiToken(voce.message);
  }
  return "errore senza motivo";
}

/**
 * Risposta di Expo a `/push/send`: `{ data: Ticket[] }` allineato posizionalmente
 * ai messaggi inviati. Se le lunghezze non coincidono l'accoppiamento non si può
 * indovinare — e sbagliarlo vorrebbe dire cancellare il token di un altro
 * dispositivo — quindi si scarta l'intero lotto con un errore.
 */
export function parseTickets(
  risposta: unknown,
  inviati: { tokenId: string }[],
): Ticket[] | { error: string } {
  if (!isRecord(risposta)) return { error: "risposta di Expo non è un oggetto" };

  // Errore di richiesta (4xx/5xx, ma anche 200 in certi casi): nessun biglietto.
  const errors = risposta.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const primo = errors[0];
    const messaggio =
      isRecord(primo) && typeof primo.message === "string"
        ? nascondiToken(primo.message)
        : "errore senza messaggio";
    return { error: messaggio };
  }

  const data = risposta.data;
  if (!Array.isArray(data)) return { error: "risposta di Expo senza «data»" };
  if (data.length !== inviati.length) {
    return {
      error: `Expo ha risposto ${data.length} biglietti per ${inviati.length} messaggi`,
    };
  }

  return data.map((voce, i) => {
    const tokenId = inviati[i].tokenId;
    if (!isRecord(voce))
      return { ticketId: "", tokenId, errore: "biglietto illeggibile" };
    if (voce.status === "ok" && typeof voce.id === "string" && voce.id !== "") {
      return { ticketId: voce.id, tokenId };
    }
    return { ticketId: "", tokenId, errore: motivo(voce) };
  });
}

/**
 * Risposta a `/push/getReceipts`: `{ data: { [ticketId]: { status, details } } }`.
 * Torna gli **id dei biglietti** le cui ricevute dicono `DeviceNotRegistered`:
 * chi chiama risale da lì al token da cancellare. Gli altri errori
 * (`MessageRateExceeded` e simili) non sono colpa del token e non lo tolgono.
 */
export function tokensToDelete(ricevute: unknown): string[] {
  if (!isRecord(ricevute)) return [];
  const data = ricevute.data;
  if (!isRecord(data)) return [];
  return Object.entries(data).flatMap(([ticketId, voce]) => {
    if (!isRecord(voce) || voce.status !== "error") return [];
    const details = voce.details;
    if (!isRecord(details) || details.error !== "DeviceNotRegistered") return [];
    return [ticketId];
  });
}
