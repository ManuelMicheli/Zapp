"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseSeedKey, SEED_MAX_PICKS } from "@/lib/taste/seed";
import { refreshTasteFor } from "@/lib/taste/refresh";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export interface OnboardingState {
  error: string | null;
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!USERNAME_RE.test(username)) {
    return {
      error:
        "Username non valido: 3–20 caratteri, solo lettere minuscole, numeri e underscore.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: displayName || null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Questo username è già in uso. Scegline un altro." };
    }
    return { error: "Errore durante il salvataggio. Riprova." };
  }

  // Anno di nascita: solo l'anno, e in una tabella privata — `profiles` la legge
  // chiunque. Fuori intervallo o assente: non si scrive nulla, non è un errore.
  const anno = Number(String(formData.get("birth_year") ?? "").trim());
  const annoValido =
    Number.isInteger(anno) && anno >= 1900 && anno <= new Date().getFullYear();
  if (annoValido) {
    await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, birth_year: anno, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }

  // Titoli seed: `["movie-603","tv-1396"]`, al massimo cinque.
  const seedRaw = String(formData.get("seed") ?? "");
  if (seedRaw) {
    try {
      const scelte = JSON.parse(seedRaw) as unknown;
      const righe = (Array.isArray(scelte) ? scelte : [])
        .filter((s): s is string => typeof s === "string")
        .slice(0, SEED_MAX_PICKS)
        .map(parseSeedKey)
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => ({
          user_id: user.id,
          title_id: r.titleId,
          media_type: r.mediaType,
        }));
      if (righe.length > 0) {
        await supabase.from("user_seed_picks").upsert(righe, { ignoreDuplicates: true });
      }
    } catch {
      // Un JSON storto non deve impedire a nessuno di entrare nell'app.
    }
  }

  // Il primo profilo, subito: senza, la prima home sarebbe cieca fino all'ora piena.
  await refreshTasteFor(user.id).catch((e: unknown) =>
    console.error("[onboarding] primo profilo non calcolato:", e),
  );

  // link invito: invia la richiesta di amicizia a chi ha invitato
  const cookieStore = await cookies();
  const ref = cookieStore.get("zapp_ref")?.value;
  if (ref && USERNAME_RE.test(ref) && ref !== username) {
    const { data: inviter } = await supabase
      .from("user_search")
      .select("id")
      .eq("username", ref)
      .maybeSingle();
    if (inviter?.id) {
      await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: inviter.id,
        status: "pending",
      });
    }
    cookieStore.delete("zapp_ref");
  }

  redirect("/");
}
