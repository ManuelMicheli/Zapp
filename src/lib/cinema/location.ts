"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isValidLatLng } from "./geo";
import { geocodeProvinceCity, geocodeQuery, reverseGeocode } from "./geocode";
import { resolveProvince, type ProvinceLookup } from "./mymovies/venues";

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
  province: ProvinceLookup,
): Promise<LocationResult> {
  const supabase = await createClient();

  // MyMovies irraggiungibile (`unknown`) non vuol dire "zona non coperta": si tiene
  // la provincia già salvata invece di azzerarla. Un `null` scritto per un guasto
  // passeggero non si ripara da solo e lascia la sezione cinema spenta per sempre.
  let provinceSlug = province.slug;
  if (province.status === "unknown") {
    const { data } = await supabase
      .from("user_locations")
      .select("province_slug")
      .eq("user_id", userId)
      .maybeSingle();
    provinceSlug = data?.province_slug ?? null;
  }

  const { error } = await supabase.from("user_locations").upsert(
    {
      user_id: userId,
      lat,
      lng,
      label,
      province_slug: provinceSlug,
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

/** Da GPS: coordinate del browser, etichetta e provincia via reverse geocoding. */
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

  // Il reverse geocoding serve sempre: anche con un'etichetta già pronta, la
  // provincia MyMovies si ricava solo da qui.
  const allowed = await rateLimit(`geocode:${userId}`, GEOCODE_LIMIT, GEOCODE_WINDOW_S, {
    condiviso: true,
  });
  if (!allowed) return { ok: false, error: RATE_LIMITED };
  const geo = await reverseGeocode(input.lat, input.lng);

  const label = input.label?.trim() || geo?.label || "Posizione attuale";
  const province = await resolveProvince(geo?.county ?? null, geo?.city ?? null);
  // dal GPS le coordinate sono già quelle vere: non si ricentra su nessuna città
  return save(userId, input.lat, input.lng, label, province);
}

/** Da testo: "Monza", "Milano Isola"… */
export async function setLocationByQuery(query: string): Promise<LocationResult> {
  const userId = await requireUser();
  if (!userId) return { ok: false, error: "Non autenticato" };

  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Scrivi una città" };

  const allowed = await rateLimit(`geocode:${userId}`, GEOCODE_LIMIT, GEOCODE_WINDOW_S, {
    condiviso: true,
  });
  if (!allowed) return { ok: false, error: RATE_LIMITED };

  const hit = await geocodeQuery(q);
  if (!hit) return { ok: false, error: "Città non trovata" };
  const province = await resolveProvince(hit.county, hit.city);

  // Chi scrive una provincia ("Monza e Brianza", "provincia di Varese") riceve da
  // Nominatim il centro geometrico del poligono, non un posto abitato: si ricentra
  // sul capoluogo, così "il cinema più vicino" parte da una città vera.
  if (!hit.city) {
    const name = province.name ?? hit.county ?? q;
    const city = await geocodeProvinceCity(name);
    if (city) return save(userId, city.lat, city.lng, city.label, province);
  }
  return save(userId, hit.lat, hit.lng, hit.label, province);
}
