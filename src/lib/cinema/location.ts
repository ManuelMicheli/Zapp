"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isValidLatLng } from "./geo";
import { geocodeQuery, reverseGeocode } from "./geocode";

export interface LocationResult {
  ok: boolean;
  error?: string;
  label?: string;
}

// Nominatim è un servizio pubblico gratuito: al massimo 10 geocodifiche
// al minuto per utente, dirette o inverse.
const GEOCODE_LIMIT = 10;
const GEOCODE_WINDOW_S = 60;
const RATE_LIMITED = "Troppe richieste, riprova tra un minuto";

/** Id dell'utente della sessione: serve prima di geocodificare, per il rate limit. */
async function requireUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function save(
  userId: string,
  lat: number,
  lng: number,
  label: string,
): Promise<LocationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("user_locations").upsert(
    {
      user_id: userId,
      lat,
      lng,
      label,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
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
  const userId = await requireUser();
  if (!userId) return { ok: false, error: "Non autenticato" };
  if (!isValidLatLng(input.lat, input.lng)) {
    return { ok: false, error: "Coordinate non valide" };
  }

  let label = input.label?.trim();
  if (!label) {
    const allowed = await rateLimit(`geocode:${userId}`, GEOCODE_LIMIT, GEOCODE_WINDOW_S);
    if (!allowed) return { ok: false, error: RATE_LIMITED };
    label = (await reverseGeocode(input.lat, input.lng)) ?? "Posizione attuale";
  }
  return save(userId, input.lat, input.lng, label);
}

/** Da testo: "Monza", "Milano Isola"… */
export async function setLocationByQuery(query: string): Promise<LocationResult> {
  const userId = await requireUser();
  if (!userId) return { ok: false, error: "Non autenticato" };

  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Scrivi una città" };

  const allowed = await rateLimit(`geocode:${userId}`, GEOCODE_LIMIT, GEOCODE_WINDOW_S);
  if (!allowed) return { ok: false, error: RATE_LIMITED };

  const hit = await geocodeQuery(q);
  if (!hit) return { ok: false, error: "Città non trovata" };
  return save(userId, hit.lat, hit.lng, hit.label);
}
