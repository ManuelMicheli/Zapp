"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { availableSeasons, isLastEpisode, nextEpisode } from "./episodes";
import type { Enums } from "@/types/database";

export type WatchStatus = Enums<"watch_status">;
export type MediaType = Enums<"media_type">;

/** Snapshot serializzabile di una entry, usato per l'undo del toast. */
export interface EntrySnapshot {
  status: WatchStatus;
  rating: number | null;
  season_number: number | null;
  episode_number: number | null;
  is_private: boolean;
  started_at: string | null;
  finished_at: string | null;
  /**
   * Ultima visione effettiva: ordina "Continua a guardare" e la libreria.
   * Opzionale: lo snapshot iniziale della scheda non lo porta, l'undo lo
   * riceve da `prev` (letto dall'action) e lo ripristina.
   */
  last_watched_at?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Stato precedente (null = non esisteva): da passare a restoreEntry per l'undo. */
  prev: EntrySnapshot | null;
  entry: EntrySnapshot | null;
}

function toSnapshot(
  row: {
    status: WatchStatus;
    rating: number | null;
    season_number: number | null;
    episode_number: number | null;
    is_private: boolean;
    started_at: string | null;
    finished_at: string | null;
    last_watched_at: string;
  } | null,
): EntrySnapshot | null {
  if (!row) return null;
  return {
    status: row.status,
    rating: row.rating,
    season_number: row.season_number,
    episode_number: row.episode_number,
    is_private: row.is_private,
    started_at: row.started_at,
    finished_at: row.finished_at,
    last_watched_at: row.last_watched_at,
  };
}

async function getContext(titleId: number, mediaType: MediaType) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato");

  const { data: existing } = await supabase
    .from("watch_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  return { supabase, user, existing };
}

function refreshPaths(titleId: number, mediaType: MediaType) {
  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath("/profile");
  revalidatePath(`/title/${mediaType}/${titleId}`);
}

async function writeEntry(
  titleId: number,
  mediaType: MediaType,
  patch: Partial<EntrySnapshot> & { status: WatchStatus },
): Promise<ActionResult> {
  try {
    const { supabase, user, existing } = await getContext(titleId, mediaType);

    // la FK richiede che il titolo sia in cache
    if (!existing) {
      const cached = await getOrFetchTitle(titleId, mediaType);
      if (!cached)
        return { ok: false, error: "Titolo non trovato", prev: null, entry: null };
    }

    const { data, error } = await supabase
      .from("watch_entries")
      .upsert(
        {
          user_id: user.id,
          title_id: titleId,
          media_type: mediaType,
          status: patch.status,
          rating: patch.rating !== undefined ? patch.rating : (existing?.rating ?? null),
          season_number:
            patch.season_number !== undefined
              ? patch.season_number
              : (existing?.season_number ?? null),
          episode_number:
            patch.episode_number !== undefined
              ? patch.episode_number
              : (existing?.episode_number ?? null),
          is_private:
            patch.is_private !== undefined
              ? patch.is_private
              : (existing?.is_private ?? false),
          started_at:
            patch.started_at !== undefined
              ? patch.started_at
              : (existing?.started_at ?? null),
          finished_at:
            patch.finished_at !== undefined
              ? patch.finished_at
              : (existing?.finished_at ?? null),
          ...(patch.last_watched_at !== undefined
            ? { last_watched_at: patch.last_watched_at }
            : {}),
        },
        { onConflict: "user_id,title_id,media_type" },
      )
      .select()
      .single();

    if (error) return { ok: false, error: error.message, prev: null, entry: null };
    refreshPaths(titleId, mediaType);
    return { ok: true, prev: toSnapshot(existing), entry: toSnapshot(data) };
  } catch (e) {
    return { ok: false, error: String(e), prev: null, entry: null };
  }
}

/** "Voglio vederlo" */
export async function addWant(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  return writeEntry(titleId, mediaType, { status: "want" });
}

/** "Inizia" / "Riprendi": want|dropped|nessuno → watching. */
export async function startWatching(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  const { existing } = await getContext(titleId, mediaType);
  return writeEntry(titleId, mediaType, {
    status: "watching",
    started_at: existing?.started_at ?? new Date().toISOString(),
    finished_at: null,
    last_watched_at: new Date().toISOString(),
  });
}

/** "Finito" / "Rivedi → visto". */
export async function markWatched(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  const { existing } = await getContext(titleId, mediaType);
  return writeEntry(titleId, mediaType, {
    status: "watched",
    started_at: existing?.started_at ?? null,
    finished_at: new Date().toISOString(),
    last_watched_at: new Date().toISOString(),
  });
}

export async function dropTitle(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  return writeEntry(titleId, mediaType, { status: "dropped" });
}

export async function removeEntry(
  titleId: number,
  mediaType: MediaType,
): Promise<ActionResult> {
  try {
    const { supabase, user, existing } = await getContext(titleId, mediaType);
    if (!existing) return { ok: true, prev: null, entry: null };
    const { error } = await supabase
      .from("watch_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("title_id", titleId)
      .eq("media_type", mediaType);
    if (error) return { ok: false, error: error.message, prev: null, entry: null };
    refreshPaths(titleId, mediaType);
    return { ok: true, prev: toSnapshot(existing), entry: null };
  } catch (e) {
    return { ok: false, error: String(e), prev: null, entry: null };
  }
}

export async function setRating(
  titleId: number,
  mediaType: MediaType,
  rating: number | null,
): Promise<ActionResult> {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    return { ok: false, error: "Voto non valido", prev: null, entry: null };
  }
  const { existing } = await getContext(titleId, mediaType);
  return writeEntry(titleId, mediaType, {
    status: existing?.status ?? "watched",
    rating,
  });
}

export async function setPrivate(
  titleId: number,
  mediaType: MediaType,
  isPrivate: boolean,
): Promise<ActionResult> {
  const { existing } = await getContext(titleId, mediaType);
  if (!existing) return { ok: false, error: "Nessuna entry", prev: null, entry: null };
  return writeEntry(titleId, mediaType, {
    status: existing.status,
    is_private: isPrivate,
  });
}

async function readSeasons(titleId: number) {
  const supabase = await createClient();
  const { data: title } = await supabase
    .from("titles")
    .select("raw")
    .eq("id", titleId)
    .eq("media_type", "tv")
    .maybeSingle();
  return availableSeasons(title?.raw ?? null);
}

/**
 * Imposta la posizione (ultimo episodio visto). È una posizione, non una
 * checklist: impostare un episodio precedente riporta indietro il progresso.
 * Se è l'ultimo episodio disponibile → transizione automatica a watched.
 */
export async function setProgress(
  titleId: number,
  season: number,
  episode: number,
): Promise<ActionResult> {
  const { existing } = await getContext(titleId, "tv");
  const seasons = await readSeasons(titleId);
  const finished = isLastEpisode(seasons, season, episode);
  return writeEntry(titleId, "tv", {
    status: finished ? "watched" : "watching",
    season_number: season,
    episode_number: episode,
    started_at: existing?.started_at ?? new Date().toISOString(),
    finished_at: finished ? new Date().toISOString() : null,
    last_watched_at: new Date().toISOString(),
  });
}

/** "+1 episodio": avanza dalla posizione corrente (o parte da S1E1). */
export async function incrementEpisode(titleId: number): Promise<ActionResult> {
  const { existing } = await getContext(titleId, "tv");
  const seasons = await readSeasons(titleId);
  const current =
    existing?.season_number != null && existing.episode_number != null
      ? { season: existing.season_number, episode: existing.episode_number }
      : null;
  const next = current
    ? nextEpisode(seasons, current.season, current.episode)
    : seasons.length > 0
      ? { season: seasons[0].season, episode: 1 }
      : null;

  if (!next) {
    // già all'ultimo episodio → chiudi la serie
    return markWatched(titleId, "tv");
  }
  return setProgress(titleId, next.season, next.episode);
}

/** Ripristina lo stato precedente (undo del toast). */
export async function restoreEntry(
  titleId: number,
  mediaType: MediaType,
  snapshot: EntrySnapshot | null,
): Promise<ActionResult> {
  if (snapshot === null) {
    return removeEntry(titleId, mediaType);
  }
  return writeEntry(titleId, mediaType, { ...snapshot });
}
