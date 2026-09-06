"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWant, restoreEntry, type EntrySnapshot } from "@/lib/watch/actions";
import { isValidLatLng } from "./geo";

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

const INVALID: PlanResult = {
  ok: false,
  error: "Dati non validi",
  planId: null,
  undo: null,
};

/**
 * I dati arrivano dal client (Server Action): si controllano prima di scriverli.
 * Ritorna l'input ripulito (testi tagliati) oppure null se è da rifiutare.
 */
function sanitize(input: PlanInput): PlanInput | null {
  if (!Number.isInteger(input.tmdbId) || input.tmdbId <= 0) return null;
  if (!Number.isInteger(input.cinemaId)) return null;
  if (Number.isNaN(Date.parse(input.startsAt))) return null;
  if (!/^https?:\/\//i.test(input.bookingUrl)) return null;
  if (
    input.cinemaLat !== null &&
    input.cinemaLng !== null &&
    !isValidLatLng(input.cinemaLat, input.cinemaLng)
  ) {
    return null;
  }
  return {
    ...input,
    filmTitle: input.filmTitle.slice(0, 200),
    cinemaName: input.cinemaName.slice(0, 200),
    cinemaAddress: input.cinemaAddress.slice(0, 200),
    format: input.format.slice(0, 20),
  };
}

/**
 * "Ci vado": salva la serata e mette il film in "Vuoi vederlo" se non è già
 * in libreria. Ritorna ciò che serve per annullare dal toast.
 */
export async function planShowing(raw: PlanInput): Promise<PlanResult> {
  const input = sanitize(raw);
  if (!input) return INVALID;

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
  const { data: prev } = await supabase
    .from("cinema_plans")
    .select("ticket_path")
    .eq("id", planId)
    .maybeSingle();
  const { error } = await supabase.from("cinema_plans").delete().eq("id", planId);
  if (error) return { ok: false };
  if (prev?.ticket_path) {
    await supabase.storage.from("tickets").remove([prev.ticket_path]);
  }
  if (undo && !undo.hadEntry) {
    await restoreEntry(undo.tmdbId, "movie", undo.prevEntry);
  }
  revalidatePath("/");
  return { ok: true };
}
