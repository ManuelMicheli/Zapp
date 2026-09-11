import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { PRESENCE_TTL_MS } from "./presence";

/**
 * Cosa i dispositivi collegati stanno riproducendo **adesso** per questo utente.
 *
 * Serve alla fila "Continua a guardare" per far scorrere il minutaggio da sola
 * invece di aspettare il battito successivo (30 s). Il solo `position_at` di
 * `watch_entries` non basta a decidere se far avanzare il tempo: l'estensione
 * manda un battito ogni 30 s **anche in pausa**, quindi una posizione fresca non
 * vuol dire che il video stia andando. Lo `state` della sessione sì.
 *
 * Una query per tutta la fila, non una per tessera: le sessioni aperte di una
 * persona sono al massimo una manciata. Legge col client dell'utente, quindi le
 * policy fanno il filtro — `watch_sessions` di un altro non si vedono.
 */
export interface LiveSession {
  titleId: number;
  providerId?: number;
  mediaType: "movie" | "tv";
  seasonNumber: number | null;
  episodeNumber: number | null;
  state: "playing" | "paused" | "stopped";
  positionMs: number;
  durationMs: number | null;
  /** quando e' stata misurata quella posizione */
  at: string;
}

/** Oltre questo tempo dall'ultimo battito la sessione non e' piu' "adesso". */
export async function getLiveSessions(): Promise<LiveSession[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const da = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  const { data } = await supabase
    .from("watching_now")
    .select(
      "title_id, provider_id, media_type, season_number, episode_number, state, position_ms, duration_ms, measured_at",
    )
    .eq("user_id", viewer.id)
    .gt("measured_at", da)
    .order("measured_at", { ascending: false });

  return (data ?? []).map((r) => ({
    titleId: r.title_id,
    providerId: r.provider_id,
    mediaType: r.media_type,
    seasonNumber: r.season_number,
    episodeNumber: r.episode_number,
    state: r.state as LiveSession["state"],
    positionMs: Number(r.position_ms ?? 0),
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    at: r.measured_at,
  }));
}
