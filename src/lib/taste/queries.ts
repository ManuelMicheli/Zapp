import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Il flag della personalizzazione, letto una volta per richiesta e condiviso dal
 * layout con tutto il resto (React `cache()`, come `getViewer`).
 *
 * Riga assente = acceso: il default sta nella colonna, e chi si è iscritto prima di
 * questa fase non deve trovarsi la personalizzazione spenta senza averlo chiesto.
 *
 * Si chiama così e non `getTaste` perché `src/lib/home/hero.ts` ha già una funzione
 * con quel nome, che fa un'altra cosa (i due generi più visti per il carosello).
 */
export const getPersonalizationEnabled = cache(async (): Promise<boolean> => {
  const user = await getViewer();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("personalization_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.personalization_enabled ?? true;
});

/** La riga del profilo di gusto. `null` finché il job non l'ha mai scritta. */
export const getTasteProfile = cache(
  async (userId: string): Promise<Tables<"user_taste"> | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_taste")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  },
);

/** Anno di nascita e flag insieme, per il profilo. */
export async function getPreferences(
  userId: string,
): Promise<{ birthYear: number | null; personalizationEnabled: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("birth_year, personalization_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    birthYear: data?.birth_year ?? null,
    personalizationEnabled: data?.personalization_enabled ?? true,
  };
}
