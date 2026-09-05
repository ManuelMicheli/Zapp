"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWant, restoreEntry, type EntrySnapshot } from "@/lib/watch/actions";

export interface PlanInput {
  tmdbId: number;
  filmTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  cinemaId: number;
  cinemaName: string;
  cinemaAddress: string;
  cinemaLat: number | null;
  cinemaLng: number | null;
  /** ISO con offset */
  startsAt: string;
  format: string;
  bookingUrl: string;
}

export interface PlanUndo {
  tmdbId: number;
  /** Entry precedente in `watch_entries` (null = non esisteva). */
  prevEntry: EntrySnapshot | null;
  /** True se l'entry esisteva già: l'undo non la tocca. */
  hadEntry: boolean;
}

export interface PlanResult {
  ok: boolean;
  error?: string;
  planId: string | null;
  undo: PlanUndo | null;
}

/**
 * "Ci vado": salva la serata e mette il film in "Vuoi vederlo" se non è già
 * in libreria. Ritorna ciò che serve per annullare dal toast.
 */
export async function planShowing(input: PlanInput): Promise<PlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", planId: null, undo: null };

  const { data: existing } = await supabase
    .from("watch_entries")
    .select("status")
    .eq("user_id", user.id)
    .eq("title_id", input.tmdbId)
    .eq("media_type", "movie")
    .maybeSingle();

  let prevEntry: EntrySnapshot | null = null;
  const hadEntry = existing !== null;
  if (!hadEntry) {
    const r = await addWant(input.tmdbId, "movie");
    if (!r.ok) return { ok: false, error: r.error, planId: null, undo: null };
    prevEntry = r.prev;
  }

  const { data, error } = await supabase
    .from("cinema_plans")
    .upsert(
      {
        user_id: user.id,
        tmdb_id: input.tmdbId,
        film_title: input.filmTitle,
        poster_path: input.posterPath,
        backdrop_path: input.backdropPath,
        cinema_id: input.cinemaId,
        cinema_name: input.cinemaName,
        cinema_address: input.cinemaAddress,
        cinema_lat: input.cinemaLat,
        cinema_lng: input.cinemaLng,
        starts_at: input.startsAt,
        format: input.format,
        booking_url: input.bookingUrl,
      },
      { onConflict: "user_id,tmdb_id,starts_at" },
    )
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: "Impossibile salvare la serata",
      planId: null,
      undo: null,
    };
  }

  revalidatePath("/");
  return {
    ok: true,
    planId: data.id,
    undo: { tmdbId: input.tmdbId, prevEntry, hadEntry },
  };
}

/** Elimina il piano; con `undo` ripristina anche l'entry creata da `planShowing`. */
export async function cancelPlan(
  planId: string,
  undo?: PlanUndo,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("cinema_plans").delete().eq("id", planId);
  if (error) return { ok: false };
  if (undo && !undo.hadEntry) {
    await restoreEntry(undo.tmdbId, "movie", undo.prevEntry);
  }
  revalidatePath("/");
  return { ok: true };
}
