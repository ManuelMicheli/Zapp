import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/** Oltre questi giorni dalla proiezione la serata e' storia, e il biglietto non serve. */
const RITENZIONE_GIORNI = 30;
/** Quante serate per giro: il job ha 60 s e ogni file e' una chiamata allo storage. */
const PER_GIRO = 200;

/**
 * Toglie le serate passate e i loro biglietti.
 *
 * Sta in un modulo suo e non in `plans.ts` perche' quello dichiara
 * `"use server"`: ogni suo export diventa un endpoint HTTP, e un aiutante da
 * job non ha nessun motivo di essere raggiungibile dal browser.
 *
 * Il bucket `tickets` e' privato e vale 1 GB: un PDF a serata per utente, e
 * finora non li toglieva nessuno. Si cancellano prima gli oggetti e poi le
 * righe: al contrario, un errore a meta' lascerebbe file di cui nessuno
 * conosce piu' il percorso.
 */
export async function prunePlans(): Promise<{ serate: number; file: number }> {
  const supabase = createServiceClient();
  const soglia = new Date(Date.now() - RITENZIONE_GIORNI * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("cinema_plans")
    .select("id, ticket_path")
    .lt("starts_at", soglia)
    .limit(PER_GIRO);
  if (error) throw new Error(`potatura serate: ${error.message}`);

  const serate = data ?? [];
  if (serate.length === 0) return { serate: 0, file: 0 };

  const percorsi = serate
    .map((p) => p.ticket_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (percorsi.length > 0) {
    await supabase.storage.from("tickets").remove(percorsi);
  }

  const { error: erroreRighe } = await supabase
    .from("cinema_plans")
    .delete()
    .in(
      "id",
      serate.map((p) => p.id),
    );
  if (erroreRighe) throw new Error(`potatura serate: ${erroreRighe.message}`);

  return { serate: serate.length, file: percorsi.length };
}
