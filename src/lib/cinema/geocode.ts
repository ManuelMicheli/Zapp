import "server-only";

import { NOMINATIM_BASE } from "@/lib/config";
import { attendiTurno } from "@/lib/gate";
import { labelFromAddress, type NominatimAddress } from "./geo";

const TIMEOUT_MS = 3000;

// Nominatim chiede uno User-Agent che identifichi l'applicazione. Sta qui e non in
// `config.ts` (importabile dal client): l'indirizzo non deve finire nel bundle.
const USER_AGENT = `Zapp/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;

async function nominatim<T>(
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
  // La policy di Nominatim e' **una richiesta al secondo per applicazione**, non
  // per utente: il limite in `location.ts` protegge noi da un singolo utente,
  // questo protegge loro da noi. Superarla non da' un errore, da' il ban.
  if (!(await attendiTurno("nominatim", 1))) return null;

  const url = new URL(`${NOMINATIM_BASE}/${path}`);
  url.searchParams.set("format", "jsonv2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Coordinate → "Quartiere, Città" più provincia/città (null se Nominatim non risponde). */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ label: string | null; county: string | null; city: string | null } | null> {
  const data = await nominatim<{ address?: NominatimAddress }>("reverse", {
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    zoom: "14",
  });
  const a = data?.address;
  if (!a) return null;
  return {
    label: labelFromAddress(a),
    county: a.county ?? a.state_district ?? null,
    city: a.city ?? a.town ?? a.village ?? null,
  };
}

export interface GeocodeHit {
  lat: number;
  lng: number;
  label: string;
  county: string | null;
  /** Comune vero. `null` quando Nominatim ha risposto con una provincia o una regione. */
  city: string | null;
}

async function search(
  q: string,
  extra: Record<string, string> = {},
): Promise<GeocodeHit | null> {
  const data = await nominatim<
    { lat: string; lon: string; address?: NominatimAddress; display_name?: string }[]
  >("search", { q, countrycodes: "it", limit: "1", addressdetails: "1", ...extra });
  const hit = data?.[0];
  if (!hit) return null;
  const label =
    (hit.address && labelFromAddress(hit.address)) ??
    hit.display_name?.split(",")[0] ??
    q;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label,
    county: hit.address?.county ?? hit.address?.state_district ?? null,
    city: hit.address?.city ?? hit.address?.town ?? hit.address?.village ?? null,
  };
}

/** Testo libero ("Monza", "Milano Isola") → prima corrispondenza in Italia. */
export async function geocodeQuery(q: string): Promise<GeocodeHit | null> {
  return search(q);
}
