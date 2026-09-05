"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidLatLng } from "./geo";
import { geocodeQuery, reverseGeocode } from "./geocode";

export interface LocationResult {
  ok: boolean;
  error?: string;
  label?: string;
}

async function save(lat: number, lng: number, label: string): Promise<LocationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { error } = await supabase
    .from("profiles")
    .update({
      location_lat: lat,
      location_lng: lng,
      location_label: label,
      location_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Impossibile salvare la posizione" };

  revalidatePath("/");
  revalidatePath("/cinema");
  revalidatePath("/title/movie/[id]", "page");
  return { ok: true, label };
}

/** Da GPS: coordinate del browser, etichetta via reverse geocoding. */
export async function setLocation(input: {
  lat: number;
  lng: number;
  label?: string;
}): Promise<LocationResult> {
  if (!isValidLatLng(input.lat, input.lng)) {
    return { ok: false, error: "Coordinate non valide" };
  }
  const label =
    input.label?.trim() ||
    (await reverseGeocode(input.lat, input.lng)) ||
    "Posizione attuale";
  return save(input.lat, input.lng, label);
}

/** Da testo: "Monza", "Milano Isola"… */
export async function setLocationByQuery(query: string): Promise<LocationResult> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Scrivi una città" };
  const hit = await geocodeQuery(q);
  if (!hit) return { ok: false, error: "Città non trovata" };
  return save(hit.lat, hit.lng, hit.label);
}
