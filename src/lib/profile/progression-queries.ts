import "server-only";

import { createClient } from "@/lib/supabase/server";

import { parseProgressionCounts, type ProgressionCounts } from "./progression";

export async function getProfileProgression(
  uid: string,
): Promise<ProgressionCounts | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_progression", { uid });

  if (error) {
    console.error("Impossibile caricare il percorso cinefilo.");
    return null;
  }

  const counts = parseProgressionCounts(data);
  if (data !== null && !counts) {
    console.error("Il percorso cinefilo ha restituito dati non validi.");
  }
  return counts;
}
