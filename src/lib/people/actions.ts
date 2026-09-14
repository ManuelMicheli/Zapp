"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isTmdbId } from "@/lib/validate";
import { MAX_PREFERITI } from "./queries";

export interface PreferitoResult {
  ok: boolean;
  /** Lo stato **dopo** l'azione: vero = adesso e' fra i preferiti. */
  preferito?: boolean;
  error?: string;
}

/** Un `profile_path` di TMDB e nient'altro: la stringa finisce in un `<Image src>`. */
const PROFILE_PATH = /^\/[A-Za-z0-9._-]{1,60}$/;

export interface PreferitoInput {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
}

/**
 * Mette o toglie una persona dai preferiti.
 *
 * Il tetto e' controllato qui e non da un vincolo del database apposta: il vincolo
 * direbbe "new row violates check constraint", questa dice cosa fare.
 *
 * La validazione qui resta piu' stretta dei vincoli del database (migration 0055:
 * `name` fino a 200 caratteri, `profile_path` fino a 200, `person_id > 0`): un
 * errore del database e' un messaggio tecnico che l'utente non deve mai vedere.
 */
export async function togglePreferito(input: PreferitoInput): Promise<PreferitoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato." };

  if (!isTmdbId(input?.personId)) return { ok: false, error: "Richiesta non valida." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (!name) return { ok: false, error: "Richiesta non valida." };
  const role = input.role === "Regia" ? "Regia" : "Cast";
  const profilePath =
    typeof input.profilePath === "string" && PROFILE_PATH.test(input.profilePath)
      ? input.profilePath
      : null;

  if (!(await rateLimit(`preferiti:${user.id}`, 30, 60))) {
    return { ok: false, error: "Troppe richieste, riprova fra poco." };
  }

  const { data: esistente } = await supabase
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", user.id)
    .eq("person_id", input.personId)
    .maybeSingle();

  if (esistente) {
    const { error } = await supabase
      .from("favorite_people")
      .delete()
      .eq("user_id", user.id)
      .eq("person_id", input.personId);
    if (error) {
      console.error("[persone] rimozione fallita:", error);
      return { ok: false, error: "Non è riuscito, riprova." };
    }
    rinfresca(input.personId);
    return { ok: true, preferito: false };
  }

  const { count } = await supabase
    .from("favorite_people")
    .select("person_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_PREFERITI) {
    return {
      ok: false,
      error: `Hai già ${MAX_PREFERITI} preferiti: togline uno.`,
    };
  }

  const { error } = await supabase.from("favorite_people").insert({
    user_id: user.id,
    person_id: input.personId,
    name,
    role,
    profile_path: profilePath,
  });
  if (error) {
    console.error("[persone] inserimento fallito:", error);
    return { ok: false, error: "Non è riuscito, riprova." };
  }
  rinfresca(input.personId);
  return { ok: true, preferito: true };
}

/** Le rotte che mostrano i preferiti: la home perché i rail nascono da lì. */
function rinfresca(personId: number) {
  revalidatePath(`/person/${personId}`);
  revalidatePath("/profile");
  revalidatePath("/");
}
