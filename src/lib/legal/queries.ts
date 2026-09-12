import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { RigaConsenso } from "./versions";

/**
 * Tutte le righe di consenso del viewer, storico compreso.
 *
 * In React `cache()` perché il layout `(app)` e la pagina profilo la chiedono
 * nella stessa richiesta: una lettura sola, condivisa.
 */
export const getConsensi = cache(async (): Promise<RigaConsenso[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_consents")
    .select("kind, version, granted_at, revoked_at")
    .eq("user_id", viewer.id);
  if (error) {
    console.error("[legal] lettura consensi:", error);
    return [];
  }
  return (data ?? []) as RigaConsenso[];
});
