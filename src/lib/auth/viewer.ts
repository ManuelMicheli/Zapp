import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface Viewer {
  id: string;
  email: string | null;
}

/**
 * Utente della richiesta, verificato localmente dalla firma del JWT (`getClaims`,
 * chiavi asimmetriche ES256 del progetto): zero viaggi verso Supabase Auth.
 * Deduplicato per richiesta con React `cache()`: layout, pagina e sezioni in
 * Suspense condividono la stessa lettura. Per le mutazioni resta `getUser()`.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});

/**
 * Riga `profiles` minima del viewer (onboarding), una lettura per richiesta.
 */
export const getViewerProfile = cache(
  async (): Promise<{ id: string; onboarding_completed_at: string | null } | null> => {
    const viewer = await getViewer();
    if (!viewer) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, onboarding_completed_at")
      .eq("id", viewer.id)
      .maybeSingle();
    return data ?? null;
  },
);
