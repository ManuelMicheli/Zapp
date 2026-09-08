import "server-only";

import { unstable_cache } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { getViewerLocation } from "@/lib/cinema/queries";
import { rateLimit } from "@/lib/rate-limit";
import type { Meteo } from "./context";
import { cella, meteoFromWmo } from "./weather-code";

/**
 * Il meteo di dove sta l'utente, chiesto a Open-Meteo (gratis, senza chiave) **solo
 * dal server**: nessuna chiamata dal browser, quindi la CSP resta com'è e le
 * coordinate non escono mai verso il client.
 *
 * Le coordinate arrivano da `user_locations`, la tabella privata che l'utente ha già
 * riempito per il cinema. Chi non ha dato la posizione non vede niente di diverso: la
 * fila esce lo stesso, scelta da ora e giorno.
 */

const TIMEOUT_MS = 3_000;
/** Mezz'ora: il tempo cambia, ma non fra due aperture dell'app. */
const TTL_S = 1_800;
const LIMITE = 20;
const FINESTRA_S = 60;

async function fetchMeteo(lat: number, lng: number): Promise<Meteo | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "Europe/Rome");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const code = data.current?.weather_code;
  if (typeof code !== "number") return null;
  const t =
    typeof data.current?.temperature_2m === "number" ? data.current.temperature_2m : null;
  return meteoFromWmo(code, t);
}

export async function getMeteo(): Promise<{ meteo: Meteo | null; citta: string | null }> {
  const [user, loc] = await Promise.all([getViewer(), getViewerLocation()]);
  if (!loc) return { meteo: null, citta: null };
  // La cache per cella fa quasi tutto il lavoro; il limite è la rete di sicurezza.
  if (user && !(await rateLimit(`meteo:${user.id}`, LIMITE, FINESTRA_S))) {
    return { meteo: null, citta: loc.label };
  }

  const lat = cella(loc.lat);
  const lng = cella(loc.lng);
  // `unstable_cache` non memorizza una promessa che si rompe: il `catch` sta fuori,
  // così un errore di rete vale `null` e non porta giù la home.
  const meteo = await unstable_cache(
    () => fetchMeteo(lat, lng),
    ["meteo", String(lat), String(lng)],
    { revalidate: TTL_S },
  )().catch(() => null);

  return { meteo, citta: loc.label };
}
