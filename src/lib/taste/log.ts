import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * I due segnali che il client non può dichiarare: aggiunta in libreria e voto.
 *
 * Li scrive il server, dentro le Server Action che stanno già aggiornando
 * `watch_entries`: lì il fatto è certo e la scrittura costa una riga in più su una
 * connessione già aperta. Accettarli da `/api/events` vorrebbe dire lasciare che
 * chiunque si costruisca il profilo di gusto con un `curl` (per questo
 * `parseEventsBody` li rifiuta, con un test che lo dimostra).
 *
 * `session_id` è casuale: gli eventi del server non appartengono a nessuna sessione
 * del browser, e la colonna non ammette nulli.
 *
 * Non solleva mai: un segnale perso non deve far fallire un'azione dell'utente.
 */
export async function logSignal(
  userId: string,
  kind: "library_add" | "rate",
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: pref } = await supabase
      .from("user_preferences")
      .select("personalization_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (pref && !pref.personalization_enabled) return;

    await supabase.from("user_events").insert({
      user_id: userId,
      kind,
      title_id: titleId,
      media_type: mediaType,
      surface: "library",
      session_id: crypto.randomUUID(),
    });
  } catch (e) {
    console.error("[taste] segnale non registrato:", e);
  }
}
