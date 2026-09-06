import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { Tables } from "@/types/database";

export interface ViewerLocation {
  lat: number;
  lng: number;
  label: string;
  provinceSlug: string | null;
}

/**
 * Posizione salvata in `user_locations` (tabella privata, RLS solo proprietario),
 * null se l'utente non l'ha ancora data.
 */
export async function getViewerLocation(): Promise<ViewerLocation | null> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return null;

  const { data } = await supabase
    .from("user_locations")
    .select("lat, lng, label, province_slug")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.lat == null || data.lng == null) return null;
  return {
    lat: data.lat,
    lng: data.lng,
    label: data.label || "Posizione attuale",
    provinceSlug: data.province_slug,
  };
}

/**
 * Id dei cinema preferiti (max 3) nell'ordine scelto. In React `cache()`: una sola
 * lettura per richiesta, condivisa fra pagina e sezioni.
 */
export const getFavoriteCinemaIds = cache(async (): Promise<number[]> => {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return [];
  const { data } = await supabase
    .from("cinema_favorites")
    .select("cinema_id, position")
    .eq("user_id", user.id)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => r.cinema_id);
});

export type PlanRow = Tables<"cinema_plans">;

/** Il prossimo piano "Ci vado": da 3 h prima a 48 h dopo adesso. */
export async function getUpcomingPlan(): Promise<PlanRow | null> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return null;

  const now = Date.now();
  const { data } = await supabase
    .from("cinema_plans")
    .select("*")
    .eq("user_id", user.id)
    .gte("starts_at", new Date(now - 3 * 3600_000).toISOString())
    .lte("starts_at", new Date(now + 48 * 3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
