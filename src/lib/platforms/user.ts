import "server-only";

import { createClient } from "@/lib/supabase/server";
import { chiaviValide } from "./keys";

export { chiaviValide };

/** Le chiavi delle piattaforme che l'utente ha dichiarato di avere. */
export async function getUserPlatforms(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_platforms")
    .select("platform_key")
    .eq("user_id", userId);
  if (error) {
    console.error("[platforms] lettura fallita:", error);
    return [];
  }
  return (data ?? []).map((r) => r.platform_key);
}

/**
 * Sostituisce l'insieme delle piattaforme dichiarate con `keys`: cancella le righe
 * tolte, inserisce quelle nuove. Le righe che restano scelte non si toccano — niente
 * `delete` seguito da un reinserimento di tutto, altrimenti `created_at` si resetterebbe
 * ogni volta che l'utente riapre l'onboarding senza cambiare idea.
 *
 * Rivalida `keys` con `chiaviValide`: questa funzione scrive, non si fida di chi la
 * chiama a monte.
 */
export async function setUserPlatforms(userId: string, keys: string[]): Promise<void> {
  const supabase = await createClient();
  const valide = chiaviValide(keys);

  const tabella = () => supabase.from("user_platforms");

  if (valide.length === 0) {
    // Nessuna piattaforma scelta: non c'è niente da tenere, si cancella tutto.
    const { error } = await tabella().delete().eq("user_id", userId);
    if (error) console.error("[platforms] cancellazione fallita:", error);
    return;
  }

  // Toglie solo quelle non più scelte: le keys arrivano dal catalogo (chiaviValide),
  // mai testo libero dell'utente, quindi interpolarle nel filtro `in` è sicuro.
  const { error: erroreCancellazione } = await tabella()
    .delete()
    .eq("user_id", userId)
    .not("platform_key", "in", `(${valide.join(",")})`);
  if (erroreCancellazione) {
    console.error("[platforms] cancellazione fallita:", erroreCancellazione);
    return;
  }

  const { error: erroreInserimento } = await tabella().upsert(
    valide.map((platform_key) => ({ user_id: userId, platform_key })),
    { onConflict: "user_id,platform_key", ignoreDuplicates: true },
  );
  if (erroreInserimento) {
    console.error("[platforms] inserimento fallito:", erroreInserimento);
  }
}
