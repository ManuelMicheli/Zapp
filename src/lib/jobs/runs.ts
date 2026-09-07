import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/** Oltre questo tempo una riga aperta è considerata morta, non in corso. */
const STALE_MS = 15 * 60 * 1000;

/**
 * Apre una riga in `job_runs`. Torna `null` se lo stesso job è già in corso: due
 * `pg_cron` sovrapposti non devono scaricare due volte lo stesso file.
 */
export async function startRun(job: string): Promise<number | null> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - STALE_MS).toISOString();
  const { data: running } = await supabase
    .from("job_runs")
    .select("id")
    .eq("job", job)
    .is("ended_at", null)
    .gt("started_at", since)
    .limit(1);
  if (running && running.length > 0) return null;

  const { data } = await supabase.from("job_runs").insert({ job }).select("id").single();
  return data?.id ?? null;
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
