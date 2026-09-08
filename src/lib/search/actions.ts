"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";

/** Verso il client va sempre un messaggio generico: il dettaglio resta nei log. */
const GENERIC_ERROR = "Non è riuscito, riprova.";

export interface SearchHistoryResult {
  ok: boolean;
  error?: string;
}

/** Una locandina TMDB e' un path assoluto senza schema: `/abc123.jpg`. */
function cleanPosterPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/[A-Za-z0-9._-]{1,190}$/.test(value) ? value : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

/**
 * Segna un titolo aperto dalla ricerca. Upsert sulla chiave: un titolo cercato
 * due volte non si duplica, risale in cima. Titolo, locandina e anno arrivano
 * dal risultato di ricerca — cioe' dal client — quindi si ripuliscono campo per
 * campo prima di scriverli.
 */
export async function rememberSearchedTitle(
  titleId: unknown,
  mediaType: unknown,
  title: unknown,
  posterPath: unknown,
  year: unknown,
): Promise<SearchHistoryResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Devi aver fatto accesso." };
  const { supabase, user } = session;

  if (!isTmdbId(titleId) || !isMediaType(mediaType)) {
    return { ok: false, error: "Richiesta non valida." };
  }
  const name = typeof title === "string" ? title.trim().slice(0, 200) : "";
  if (!name) return { ok: false, error: "Richiesta non valida." };

  // Una scrittura per titolo aperto: il limite serve solo contro chi pesta
  // l'endpoint, non contro l'uso normale.
  if (!(await rateLimit(`search-history:${user.id}`, 300, 3600))) {
    return { ok: false, error: "Troppe richieste, riprova più tardi." };
  }

  const { error } = await supabase.from("search_history").upsert(
    {
      user_id: user.id,
      title_id: titleId,
      media_type: mediaType,
      title: name,
      poster_path: cleanPosterPath(posterPath),
      year: isIntInRange(year, 1870, 2200) ? year : null,
      searched_at: new Date().toISOString(),
    },
    { onConflict: "user_id,title_id,media_type" },
  );
  if (error) {
    console.error("rememberSearchedTitle", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/search");
  return { ok: true };
}

/** Svuota lo storico. La RLS limita la cancellazione alle proprie righe. */
export async function clearSearchHistory(): Promise<SearchHistoryResult> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Devi aver fatto accesso." };
  const { supabase, user } = session;

  if (!(await rateLimit(`search-history-clear:${user.id}`, 30, 3600))) {
    return { ok: false, error: "Troppe richieste, riprova più tardi." };
  }

  const { error } = await supabase.from("search_history").delete().eq("user_id", user.id);
  if (error) {
    console.error("clearSearchHistory", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/search");
  return { ok: true };
}
