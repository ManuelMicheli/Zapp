"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextFreePosition, TOO_MANY_FAVORITES } from "./favorites";

export interface FavoriteResult {
  ok: boolean;
  error?: string;
  /** Id preferiti dopo l'azione, in ordine di posizione. */
  favoriteIds: number[];
}

/**
 * Aggiunge o toglie un cinema dai preferiti (max `MAX_FAVORITE_CINEMAS`). Il nuovo
 * preferito prende la prima posizione libera: tolto il 2°, il prossimo entra 2°.
 * `cinemaId` è l'id nella sorgente attiva (MyMovies), come `cinema_links`.
 */
export async function toggleFavoriteCinema(cinemaId: number): Promise<FavoriteResult> {
  if (!Number.isInteger(cinemaId)) {
    return { ok: false, error: "Cinema non valido", favoriteIds: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", favoriteIds: [] };

  const { data: rows } = await supabase
    .from("cinema_favorites")
    .select("cinema_id, position")
    .eq("user_id", user.id)
    .order("position", { ascending: true });
  const current = rows ?? [];
  const ids = () => current.map((r) => r.cinema_id);

  if (current.some((r) => r.cinema_id === cinemaId)) {
    const { error } = await supabase
      .from("cinema_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("cinema_id", cinemaId);
    if (error) {
      return {
        ok: false,
        error: "Impossibile aggiornare i preferiti",
        favoriteIds: ids(),
      };
    }
    revalidate();
    return { ok: true, favoriteIds: ids().filter((id) => id !== cinemaId) };
  }

  const position = nextFreePosition(current.map((r) => r.position));
  if (position === null) {
    return { ok: false, error: TOO_MANY_FAVORITES, favoriteIds: ids() };
  }
  const { error } = await supabase
    .from("cinema_favorites")
    .insert({ user_id: user.id, cinema_id: cinemaId, position });
  if (error) {
    // Unique su (user_id, position): un secondo tap in parallelo ha già riempito il posto.
    return { ok: false, error: TOO_MANY_FAVORITES, favoriteIds: ids() };
  }
  revalidate();
  const next = [...current, { cinema_id: cinemaId, position }].sort(
    (a, b) => a.position - b.position,
  );
  return { ok: true, favoriteIds: next.map((r) => r.cinema_id) };
}

function revalidate() {
  revalidatePath("/cinema");
  revalidatePath("/title/movie/[id]", "page");
}
