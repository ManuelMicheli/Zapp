import "server-only";

import { NOMINATIM_BASE } from "@/lib/config";
import { labelFromAddress, type NominatimAddress } from "./geo";

const TIMEOUT_MS = 3000;

// Nominatim chiede uno User-Agent che identifichi l'applicazione. Sta qui e non in
// `config.ts` (importabile dal client): l'indirizzo non deve finire nel bundle.
const USER_AGENT = `Zapp/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;

async function nominatim<T>(
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
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

/** Coordinate → "Quartiere, Città" (null se Nominatim non risponde). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const data = await nominatim<{ address?: NominatimAddress }>("reverse", {
    lat: lat.toFixed(4),
    lon: lng.toFixed(4),
    zoom: "14",
  });
  return data?.address ? labelFromAddress(data.address) : null;
}

/** Testo libero ("Monza", "Milano Isola") → prima corrispondenza in Italia. */
export async function geocodeQuery(
  q: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const data = await nominatim<
    { lat: string; lon: string; address?: NominatimAddress; display_name?: string }[]
  >("search", { q, countrycodes: "it", limit: "1", addressdetails: "1" });
  const hit = data?.[0];
  if (!hit) return null;
  const label =
    (hit.address && labelFromAddress(hit.address)) ??
    hit.display_name?.split(",")[0] ??
    q;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label };
}
