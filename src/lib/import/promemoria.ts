import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  GIORNI_SECONDO_SOLLECITO,
  prossimoPromemoria,
  type RichiestaPromemoria,
} from "./richieste";

/**
 * Il job giornaliero `promemoria-export`: ricorda a chi ha chiesto un export a
 * Disney+, NOW o Apple TV di andare a controllare la posta, con al massimo due
 * promemoria per richiesta (vedi `prossimoPromemoria`, `./richieste.ts`).
 *
 * Gira col service client, come gli altri job che attraversano le righe di piu'
 * utenti (`drainNotifications`, `ratings-refresh`): `import_requests` ha RLS per
 * proprietario, e qui non c'e' nessuna sessione utente da cui partire.
 *
 * **`import_requests` non e' ancora nei tipi generati** (migration 0063 non
 * ancora applicata): tabella e colonne sono scritte a mano, come in
 * `richieste-store.ts`, finche' non si rigenerano dopo l'apply.
 */

/** Riga di `import_requests` con solo i campi che servono a questo job. */
interface RigaCandidata {
  id: string;
  user_id: string;
  platform_key: string;
  state: "requested" | "imported" | "dismissed";
  expected_at: string;
  reminded_at: string | null;
  second_reminded_at: string | null;
}

const CAMPI =
  "id, user_id, platform_key, state, expected_at, reminded_at, second_reminded_at";

/**
 * Inserisce la notifica **prima** di scrivere la colonna che segna il
 * promemoria mandato, non dopo: se il job muore a meta' elenco, la riga gia'
 * notificata ma non ancora segnata viene ripresa al giro dopo e l'utente
 * riceve un doppione — fastidioso ma visibile. Il contrario (segnare prima,
 * notificare dopo) perderebbe per sempre il promemoria di chi capita proprio
 * sulla riga in cui l'insert fallisce: un promemoria mai arrivato non si nota,
 * uno doppio si', ed e' la stessa scelta gia' fatta in `drainNotifications`
 * per `pushed_at` (vedi `src/lib/push/fanout.ts`).
 *
 * Le righe successive dell'elenco non risentono di un guasto su una riga: ogni
 * riga e' un insert e un update indipendenti, non una transazione unica.
 */
export async function promemoriaExport(): Promise<{
  candidati: number;
  primo: number;
  secondo: number;
  falliti: number;
}> {
  const supabase = createServiceClient();
  const oggi = new Date().toISOString().slice(0, 10);
  const adesso = new Date();
  const sogliaSecondo = new Date(adesso);
  sogliaSecondo.setUTCDate(sogliaSecondo.getUTCDate() - GIORNI_SECONDO_SOLLECITO);

  // Primo sollecito: usa `import_requests_due_idx` (expected_at, reminded_at is null).
  const { data: primi, error: erroreA } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("import_requests" as any)
    .select(CAMPI)
    .eq("state", "requested")
    .is("reminded_at", null)
    .lte("expected_at", oggi);
  if (erroreA) throw new Error(`richieste al primo sollecito: ${erroreA.message}`);

  // Secondo sollecito: usa `import_requests_due_again_idx` (reminded_at, gia'
  // ricordate una volta, non ancora una seconda).
  const { data: secondi, error: erroreB } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("import_requests" as any)
    .select(CAMPI)
    .eq("state", "requested")
    .not("reminded_at", "is", null)
    .is("second_reminded_at", null)
    .lte("reminded_at", sogliaSecondo.toISOString());
  if (erroreB) throw new Error(`richieste al secondo sollecito: ${erroreB.message}`);

  const righe = [
    ...((primi ?? []) as unknown as RigaCandidata[]),
    ...((secondi ?? []) as unknown as RigaCandidata[]),
  ];

  let primo = 0;
  let secondo = 0;
  let falliti = 0;

  for (const riga of righe) {
    const stato: RichiestaPromemoria = {
      state: riga.state,
      expectedAt: riga.expected_at,
      remindedAt: riga.reminded_at,
      secondRemindedAt: riga.second_reminded_at,
    };
    // Le due query sopra dovrebbero gia' filtrare esattamente questo: la
    // rilettura con la stessa funzione pura del test e' la difesa in
    // profondita', non il filtro principale.
    const esito = prossimoPromemoria(stato, oggi, adesso);
    if (esito === null) continue;

    const { error: erroreInsert } = await supabase.from("notifications").insert({
      user_id: riga.user_id,
      kind: "export_pronto",
      payload: { platform_key: riga.platform_key },
    });
    if (erroreInsert) {
      console.error(
        `[import] promemoria non inviato per ${riga.id}: ${erroreInsert.message}`,
      );
      falliti++;
      continue; // niente reminded_at: si riprova al giro dopo, non si perde
    }

    const campo = esito === "primo" ? "reminded_at" : "second_reminded_at";
    const { error: erroreUpdate } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("import_requests" as any)
      .update({ [campo]: new Date().toISOString() })
      .eq("id", riga.id)
      .eq("state", "requested");
    if (erroreUpdate) {
      // La notifica e' gia' partita: se questo fallisce, il prossimo giro la
      // rimanda (stessa riga, stessa condizione) invece di segnarla persa.
      console.error(
        `[import] ${campo} non scritto per ${riga.id}: ${erroreUpdate.message}`,
      );
      falliti++;
      continue;
    }

    if (esito === "primo") primo++;
    else secondo++;
  }

  return { candidati: righe.length, primo, secondo, falliti };
}
