import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { entryPatch, type WatchAction } from "./patch";

/**
 * Scrive `watch_entries` senza la sessione dell'utente: esiste accanto ad
 * `actions.ts` (che resta il percorso normale, con cookie e RLS) perche' la
 * rotta a token dispositivo (fase 4, "Ehi Siri...") non ha una sessione da
 * passare — solo uno `userId` verificato a monte dal bearer del dispositivo.
 * Per questo usa il service client (eccezione motivata in `CLAUDE.md`: il
 * service client e' riservato ai dati di sistema, qui bypassa RLS per scrivere
 * la riga di un utente preciso senza cookie).
 *
 * NON fa `revalidatePath` (lo fa la rotta HTTP, non e' un Server Action), NON
 * chiama `logSignal` (nessun segnale per il profilo di gusto da qui: e' una
 * scelta della fase 4, non una svista) e NON tocca `watch_sessions` (nessuna
 * presenza "sto guardando" per gli amici: e' un'intenzione dichiarata da Siri,
 * non una riproduzione osservata).
 */
export async function applyWatch(
  userId: string,
  titleId: number,
  mediaType: "movie" | "tv",
  action: WatchAction,
): Promise<
  { ok: true; title: string } | { ok: false; error: "titolo_sconosciuto" | "db" }
> {
  const cached = await getOrFetchTitle(titleId, mediaType);
  if (!cached) return { ok: false, error: "titolo_sconosciuto" };

  const db = createServiceClient();

  const { data: existing } = await db
    .from("watch_entries")
    .select("started_at")
    .eq("user_id", userId)
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  const { error } = await db.from("watch_entries").upsert(
    {
      user_id: userId,
      title_id: titleId,
      media_type: mediaType,
      ...entryPatch(action, existing, new Date().toISOString()),
    },
    { onConflict: "user_id,title_id,media_type" },
  );

  if (error) {
    // Mai l'id utente nel log: solo il messaggio di Postgres.
    console.error("[watch] applyWatch", error.message);
    return { ok: false, error: "db" };
  }

  return { ok: true, title: cached.title.title };
}
