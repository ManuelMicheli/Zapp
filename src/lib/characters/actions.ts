"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbCredits } from "@/lib/tmdb/types";
import { isMediaType, isTmdbId } from "@/lib/validate";
import { primaryCharacter } from "./rank";

export interface CharacterResult {
  ok: boolean;
  error?: string;
}

/** Messaggio unico verso il client: il dettaglio PostgREST resta nei log. */
const GENERIC_ERROR = "Non è riuscito, riprova.";
const INVALID: CharacterResult = { ok: false, error: "Richiesta non valida." };
const TOO_MANY: CharacterResult = {
  ok: false,
  error: "Troppe richieste, riprova più tardi.",
};
const NO_SESSION: CharacterResult = { ok: false, error: "Devi aver fatto accesso." };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

/**
 * Sceglie (o cambia) il personaggio preferito di un titolo. `personId` deve
 * stare nel cast di `titles.raw`: gli argomenti arrivano da chiunque abbia una
 * sessione, e senza questo controllo si voterebbe una persona qualunque.
 */
export async function setFavoriteCharacter(
  titleId: unknown,
  mediaType: unknown,
  personId: unknown,
): Promise<CharacterResult> {
  const session = await requireUser();
  if (!session) return NO_SESSION;
  const { supabase, user } = session;
  if (!isTmdbId(titleId) || !isMediaType(mediaType) || !isTmdbId(personId))
    return INVALID;
  if (!(await rateLimit(`character-vote:${user.id}`, 60, 3600))) return TOO_MANY;

  // la FK composta su `titles` esige la riga, e da qui si legge il cast
  const cached = await getOrFetchTitle(titleId, mediaType);
  if (!cached) return { ok: false, error: GENERIC_ERROR };
  const credits = (cached.title.raw as { credits?: TmdbCredits } | null)?.credits;
  const member = credits?.cast?.find((c) => c.id === personId);
  if (!member) return INVALID;

  const { error } = await supabase.from("favorite_characters").upsert(
    {
      user_id: user.id,
      title_id: titleId,
      media_type: mediaType,
      person_id: personId,
      character_name: primaryCharacter(member.character).slice(0, 200),
    },
    { onConflict: "user_id,title_id,media_type" },
  );
  if (error) {
    console.error("setFavoriteCharacter", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`/title/${mediaType}/${titleId}`);
  return { ok: true };
}

/** Toglie il proprio voto. */
export async function clearFavoriteCharacter(
  titleId: unknown,
  mediaType: unknown,
): Promise<CharacterResult> {
  const session = await requireUser();
  if (!session) return NO_SESSION;
  const { supabase, user } = session;
  if (!isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  if (!(await rateLimit(`character-vote:${user.id}`, 60, 3600))) return TOO_MANY;

  // proprietà anche nel codice, non solo nella RLS (regola di security.md)
  const { error } = await supabase
    .from("favorite_characters")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .eq("media_type", mediaType);
  if (error) {
    console.error("clearFavoriteCharacter", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath(`/title/${mediaType}/${titleId}`);
  return { ok: true };
}
