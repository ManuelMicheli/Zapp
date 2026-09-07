import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { planPhase } from "./dates";
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

export interface UpcomingPlan {
  plan: PlanRow;
  /** URL firmato (1 h) dell'originale del biglietto nel bucket privato, se caricato. */
  ticketUrl: string | null;
  /** Id dell'utente: la cartella del bucket in cui il browser carica il biglietto. */
  userId: string;
}

export interface HomePlan {
  /** La serata da mostrare in home: fino a un'ora dopo l'inizio dello spettacolo. */
  upcoming: UpcomingPlan | null;
  /** L'ultima serata finita a cui l'utente non ha ancora risposto "com'è andata". */
  past: PlanRow | null;
}

const NO_PLAN: HomePlan = { upcoming: null, past: null };

/**
 * Le serate "Ci vado" che riguardano la home: quella in arrivo (banner) e quella
 * appena finita (al rientro nell'app si chiede com'è andata). La fine dello
 * spettacolo si calcola con la durata del film (`titles.runtime`), letta in una sola
 * query per tutte le serate della finestra.
 */
export async function getHomePlan(): Promise<HomePlan> {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return NO_PLAN;

  const now = Date.now();
  const { data: rows } = await supabase
    .from("cinema_plans")
    .select("*")
    .eq("user_id", user.id)
    .gte("starts_at", new Date(now - 8 * 24 * 3600_000).toISOString())
    .lte("starts_at", new Date(now + 48 * 3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);
  if (!rows || rows.length === 0) return NO_PLAN;

  const { data: titles } = await supabase
    .from("titles")
    .select("id, runtime")
    .eq("media_type", "movie")
    .in("id", [...new Set(rows.map((r) => r.tmdb_id))]);
  const runtimes = new Map((titles ?? []).map((t) => [t.id, t.runtime]));

  let upcoming: PlanRow | null = null;
  let past: PlanRow | null = null;
  for (const row of rows) {
    const phase = planPhase(row.starts_at, runtimes.get(row.tmdb_id) ?? null, now);
    if (phase === "upcoming" && !upcoming) upcoming = row;
    if (phase === "ended") past = row; // le righe sono in ordine: resta la più recente
  }
  if (!upcoming) return { upcoming: null, past };

  let ticketUrl: string | null = null;
  // Il vincolo in `cinema_plans` gia' obbliga il path a stare nella cartella
  // dell'utente; qui lo si ricontrolla prima di firmarlo, perche' e' l'unico
  // punto in cui una stringa del database diventa un URL scaricabile.
  if (upcoming.ticket_path && upcoming.ticket_path.startsWith(`${user.id}/`)) {
    const { data: signed } = await supabase.storage
      .from("tickets")
      .createSignedUrl(upcoming.ticket_path, 3600);
    ticketUrl = signed?.signedUrl ?? null;
  }
  return { upcoming: { plan: upcoming, ticketUrl, userId: user.id }, past };
}
