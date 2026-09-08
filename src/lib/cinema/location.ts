"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { CINEMA_RADIUS_KM } from "@/lib/config";
import { comuneLabel, findComune, nearestComune, provinceSlugForSigla } from "./comuni";
import { isValidLatLng } from "./geo";
import { reverseGeocode } from "./geocode";
import { nearbyProvinceSlugs, type ProvinceLookup } from "./mymovies/venues";

export interface LocationResult {
  ok: boolean;
  error?: string;
  label?: string;
}

// Nominatim è un servizio pubblico gratuito e serve solo per l'etichetta: al massimo
// 10 geocodifiche al minuto per utente. Oltre, resta il nome del comune.
const GEOCODE_LIMIT = 10;
const GEOCODE_WINDOW_S = 60;

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

  // La provincia viene dal **comune più vicino** nell'elenco ISTAT: nessuna chiamata,
  // nessun nome da interpretare, e funziona anche se Nominatim o MyMovies sono giù —
  // prima un guasto passeggero salvava `province_slug = null` e la sezione cinema
  // restava spenta.
  const comune = nearestComune(input);
  let slug = comune ? provinceSlugForSigla(comune.sigla) : null;
  if (!slug) {
    const [nearby] = await nearbyProvinceSlugs(input, CINEMA_RADIUS_KM, "");
    slug = nearby ?? null;
  }

  // Nominatim serve solo per l'etichetta bella ("Isola, Milano"): se non risponde
  // resta il nome del comune.
  let label = input.label?.trim() ?? "";
  if (!label) {
    const allowed = await rateLimit(
      `geocode:${userId}`,
      GEOCODE_LIMIT,
      GEOCODE_WINDOW_S,
      { condiviso: true },
    );
    const geo = allowed ? await reverseGeocode(input.lat, input.lng) : null;
    label = geo?.label || (comune ? comuneLabel(comune) : "") || "Posizione attuale";
  }
  // dal GPS le coordinate sono già quelle vere: non si ricentra su nessuna città
  return save(userId, input.lat, input.lng, label, {
    slug,
    status: slug ? "found" : "none",
    name: null,
  });
}

/**
 * Da un comune scelto nell'elenco ("Ossona, MI"): niente geocoding, niente
 * indovinelli. Nome e sigla arrivano dal client — cioè da chiunque abbia una sessione
 * — e servono solo a **ritrovare la riga vera** in `comuni-it.json`: coordinate,
 * etichetta e provincia MyMovies le scrive il server. Dove MyMovies non ha la
 * provincia (Sud Sardegna) la si deduce dalle sale già note lì attorno.
 */
export async function setLocationByComune(
  name: string,
  sigla: string,
): Promise<LocationResult> {
  const userId = await requireUser();
  if (!userId) return { ok: false, error: "Non autenticato" };
  if (typeof name !== "string" || typeof sigla !== "string") {
    return { ok: false, error: "Comune non valido" };  }

  const comune = findComune(name.slice(0, 80), sigla.slice(0, 4));
  if (!comune) return { ok: false, error: "Comune non trovato" };

  let slug = provinceSlugForSigla(comune.sigla);
  if (!slug) {
    const [nearby] = await nearbyProvinceSlugs(comune, CINEMA_RADIUS_KM, "");
    slug = nearby ?? null;
  }
  return save(userId, comune.lat, comune.lng, comuneLabel(comune), {
    slug,
    status: slug ? "found" : "none",
    name: null,
  });
}
