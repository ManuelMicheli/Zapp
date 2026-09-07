import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/** Oltre questo tempo una riga aperta è considerata morta, non in corso. */
const STALE_MS = 15 * 60 * 1000;

/** `id` quando la riga è stata aperta; `busy` se un'altra esecuzione è già in corso; `error` se l'apertura è fallita. */
export type EsitoApertura =
  | { stato: "aperta"; id: number }
  | { stato: "occupato" }
  | { stato: "errore"; messaggio: string };

/**
 * Apre una riga in `job_runs`. Torna `occupato` se lo stesso job è già in corso: due
 * `pg_cron` sovrapposti non devono scaricare due volte lo stesso file né consumare
 * due volte la quota.
 *
 * Il lucchetto è l'indice unico parziale `job_runs_uno_aperto_idx` (migration 0022):
 * l'inserimento **è** il controllo, quindi non esiste una finestra fra i due in cui
 * due esecuzioni possano passare entrambe.
 *
 * `occupato` ed `errore` erano lo stesso caso (torna `null`): un fallimento
 * dell'inserimento per un motivo diverso dal lucchetto (permessi, tabella assente,
 * connessione) veniva riletto come "già in corso" e la route rispondeva 409,
 * mascherando il guasto vero dietro un esito atteso.
 */
export async function startRun(job: string): Promise<EsitoApertura> {
  const supabase = createServiceClient();

  // Una riga lasciata aperta da un processo morto bloccherebbe il job per sempre:
  // prima la si chiude, dichiarandola interrotta.
  await supabase
    .from("job_runs")
    .update({
      ended_at: new Date().toISOString(),
      ok: false,
      detail: { errore: "interrotto senza chiusura" } as unknown as Json,
    })
    .eq("job", job)
    .is("ended_at", null)
    .lt("started_at", new Date(Date.now() - STALE_MS).toISOString());

  const { data, error } = await supabase
    .from("job_runs")
    .insert({ job })
    .select("id")
    .single();

  if (error) {
    // 23505 = violazione di unicità: c'è già un'esecuzione aperta, ed è il
    // comportamento voluto, non un guasto da segnalare
    if (error.code === "23505") return { stato: "occupato" };
    console.error(`[jobs] apertura di ${job} fallita:`, error.message);
    return { stato: "errore", messaggio: error.message };
  }
  return { stato: "aperta", id: data.id };
}

/** Chiude la riga con l'esito e quello che è successo. */
export async function endRun(
  id: number | null,
  ok: boolean,
  detail: Record<string, unknown>,
): Promise<void> {
  if (id === null) return;
  const supabase = createServiceClient();
  await supabase
    .from("job_runs")
    .update({ ended_at: new Date().toISOString(), ok, detail: detail as unknown as Json })
    .eq("id", id);
}
