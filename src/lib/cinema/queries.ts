import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export interface ViewerLocation {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Posizione salvata in `user_locations` (tabella privata, RLS solo proprietario),
 * null se l'utente non l'ha ancora data.
 */
export async function getViewerLocation(): Promise<ViewerLocation | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_locations")
    .select("lat, lng, label")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.lat == null || data.lng == null) return null;
  return {
    lat: data.lat,
    lng: data.lng,
    label: data.label || "Posizione attuale",
  };
}

export type PlanRow = Tables<"cinema_plans">;

/** Il prossimo piano "Ci vado": da 3 h prima a 48 h dopo adesso. */
export async function getUpcomingPlan(): Promise<PlanRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
