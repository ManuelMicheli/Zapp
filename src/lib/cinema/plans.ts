"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWant, restoreEntry, type EntrySnapshot } from "@/lib/watch/actions";
import { romeDateString } from "./dates";
import { isValidLatLng } from "./geo";
import { isSafeExternalUrl, isTmdbId, isUuid } from "@/lib/validate";
import { getProvinceVenues } from "./mymovies/venues";
import { getViewerLocation } from "./queries";
import { getCinemaProgramme } from "./showtimes";
import type { Showing } from "./types";

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
  if (!isTmdbId(input.tmdbId)) return null;
  if (!Number.isInteger(input.cinemaId)) return null;
  if (typeof input.startsAt !== "string" || Number.isNaN(Date.parse(input.startsAt))) {
    return null;
  }
  // Il link finisce in un bottone che l'utente poi apre: solo https verso un
  // dominio pubblico, mai `javascript:`, `data:` o un host interno.
  if (!isSafeExternalUrl(input.bookingUrl)) return null;
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
  if (!isUuid(planId)) return { ok: false };
  const supabase = await createClient();
  // Prima non c'era ne' il controllo della sessione ne' il filtro sul
  // proprietario: la serata (e il suo biglietto) si cancellavano solo grazie
  // alle RLS. Il controllo va fatto anche qui, non solo nel database.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: prev } = await supabase
    .from("cinema_plans")
    .select("ticket_path")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prev) return { ok: false };
  const { error } = await supabase
    .from("cinema_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", user.id);
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

export interface PlanAlternatives {
  /** Gli altri spettacoli di oggi dello stesso film nella stessa sala. */
  showings: Showing[];
  /** Perché l'elenco è vuoto (da mostrare nel foglio). */
  error?: string;
}

/**
 * Gli orari di oggi con cui si può sostituire quello scelto: stesso film, stessa sala
 * (MyMovies pubblica solo il programma di oggi). Il programma della sala è già in
 * cache per la home e per /cinema: cambiare orario non costa una richiesta in più.
 */
export async function getPlanAlternatives(planId: string): Promise<PlanAlternatives> {
  if (!isUuid(planId)) return { showings: [], error: "Serata non trovata" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { showings: [], error: "Non autenticato" };

  const { data: plan } = await supabase
    .from("cinema_plans")
    .select("tmdb_id, cinema_id, starts_at")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!plan) return { showings: [], error: "Serata non trovata" };

  const location = await getViewerLocation();
  if (!location?.provinceSlug) {
    return { showings: [], error: "Zona non coperta" };
  }
  const venues = await getProvinceVenues(location.provinceSlug);
  const cinema = venues.find((c) => c.id === plan.cinema_id);
  if (!cinema) return { showings: [], error: "Sala non più in programmazione" };

  const programme = await getCinemaProgramme(location, cinema, romeDateString());
  const film = programme.find((f) => f.film.tmdbId === plan.tmdb_id);
  if (!film) {
    return { showings: [], error: "Oggi questa sala non dà il film" };
  }
  const now = Date.now();
  const showings = film.showings.filter(
    (s) => new Date(s.start).getTime() > now && s.start !== plan.starts_at,
  );
  return {
    showings,
    error: showings.length === 0 ? "Nessun altro orario oggi in questa sala" : undefined,
  };
}

/** Sposta la serata su un altro spettacolo della stessa sala. */
export async function movePlan(
  planId: string,
  showing: Showing,
): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(planId)) return { ok: false, error: "Serata non trovata" };
  if (typeof showing?.start !== "string" || Number.isNaN(Date.parse(showing.start))) {
    return { ok: false, error: "Orario non valido" };
  }
  if (!isSafeExternalUrl(showing.bookingUrl)) {
    return { ok: false, error: "Link non valido" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase
    .from("cinema_plans")
    .update({
      starts_at: showing.start,
      format: showing.format.slice(0, 20),
      booking_url: showing.bookingUrl,
    })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) {
    // vincolo (user_id, tmdb_id, starts_at): la serata su quell'orario esiste già
    return { ok: false, error: "Hai già salvato questo spettacolo" };
  }
  revalidatePath("/");
  return { ok: true };
}
