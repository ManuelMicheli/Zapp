import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { CreditoPersona } from "./filmography";

/**
 * Letture sui preferiti. Nessun controllo di permessi scritto qui dentro: la policy
 * `favorite_people_select` (migration 0054) lascia passare i propri e quelli degli
 * amici, e per un estraneo la `select` torna vuota da sola. Un `if` in piu' qui
 * sarebbe una seconda regola da tenere allineata alla prima.
 */

export interface PersonaPreferita {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
}

/** Tetto dichiarato in un posto solo: lo legge anche l'azione. */
export const MAX_PREFERITI = 12;

export async function getFavoritePeople(userId: string): Promise<PersonaPreferita[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorite_people")
    .select("person_id, name, role, profile_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_PREFERITI);

  return (data ?? []).map((r) => ({
    personId: r.person_id,
    name: r.name,
    role: r.role === "Regia" ? "Regia" : "Cast",
    profilePath: r.profile_path,
  }));
}

/**
 * Le chiavi dei propri preferiti nella forma di `title_people`: `Cast:Pedro Pascal`.
 * `cache` perche' in home la chiedono tre punti diversi nello stesso render.
 */
export const getFavoriteKeys = cache(async (): Promise<string[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const preferiti = await getFavoritePeople(viewer.id);
  return preferiti.map((p) => `${p.role}:${p.name}`);
});

/** Se il viewer ha gia' questa persona fra i preferiti. */
export async function isFavorite(personId: number): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", viewer.id)
    .eq("person_id", personId)
    .maybeSingle();
  return Boolean(data);
}

export interface Conoscenza {
  visti: number;
  totale: number;
  /** Voto medio che il viewer da' ai titoli visti di questa persona; `null` se non vota. */
  media: number | null;
}

/**
 * "Hai visto 7 dei suoi 41 titoli - gli dai 8,4 di media".
 *
 * Due `in (...)` sugli id che abbiamo gia' in mano dalla filmografia, senza join su
 * `titles`: qui non serve nessun dato del titolo, solo stato e voto.
 */
export async function conoscenzaDi(crediti: CreditoPersona[]): Promise<Conoscenza> {
  const viewer = await getViewer();
  const totale = crediti.length;
  if (!viewer || totale === 0) return { visti: 0, totale, media: null };

  const supabase = await createClient();
  const idFilm = crediti.filter((c) => c.mediaType === "movie").map((c) => c.id);
  const idSerie = crediti.filter((c) => c.mediaType === "tv").map((c) => c.id);

  const [film, serie] = await Promise.all([
    idFilm.length
      ? supabase
          .from("watch_entries")
          .select("rating")
          .eq("user_id", viewer.id)
          .eq("media_type", "movie")
          .eq("status", "watched")
          .in("title_id", idFilm)
      : Promise.resolve({ data: [] as { rating: number | null }[] }),
    idSerie.length
      ? supabase
          .from("watch_entries")
          .select("rating")
          .eq("user_id", viewer.id)
          .eq("media_type", "tv")
          .eq("status", "watched")
          .in("title_id", idSerie)
      : Promise.resolve({ data: [] as { rating: number | null }[] }),
  ]);

  const righe = [...(film.data ?? []), ...(serie.data ?? [])];
  const voti = righe
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === "number" && r > 0);

  return {
    visti: righe.length,
    totale,
    media: voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
  };
}
