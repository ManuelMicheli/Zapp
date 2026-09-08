import "server-only";

import { unstable_cache } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { getViewerLocation } from "@/lib/cinema/queries";
import { rateLimit } from "@/lib/rate-limit";
import type { Meteo } from "./context";
import { cella, etichettaMeteo, meteoDa, type Osservazione } from "./weather-code";

/**
 * Il meteo di dove sta l'utente, chiesto a Open-Meteo (gratis, senza chiave) **solo
 * dal server**: nessuna chiamata dal browser, quindi la CSP resta com'è e le
 * coordinate non escono mai verso il client.
 *
 * Le coordinate arrivano da `user_locations`, la tabella privata che l'utente ha già
 * riempito per il cinema. Chi non ha dato la posizione non vede niente di diverso: la
 * fila esce lo stesso, scelta da ora e giorno.
 */

const TIMEOUT_MS = 4_000;
/**
 * Un quarto d'ora, come l'intervallo di Open-Meteo (`interval: 900`). A mezz'ora si
 * poteva mostrare una misura vecchia il doppio del passo con cui viene aggiornata.
 */
const TTL_S = 900;
const LIMITE = 20;
const FINESTRA_S = 60;

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * `precipitation` e `cloud_cover` non sono un di piu': senza la prima si finisce a dire
 * "piove" perche' il codice WMO annuncia rovesci sulla cella mentre a terra non cade
 * niente (Ossona, 2026-09-08: codice 80, 0,0 mm, 30,8 gradi).
 */
async function fetchOsservazione(lat: number, lng: number): Promise<Osservazione> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,precipitation,cloud_cover",
  );
  url.searchParams.set("timezone", "Europe/Rome");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  // Si **lancia** invece di tornare `null`: `unstable_cache` non memorizza una promessa
  // che si rompe, mentre un `null` lo terrebbe per tutta la finestra. Una chiamata
  // fallita al primo avvio lasciava la fila senza meteo per un quarto d'ora.
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = (await res.json()) as { current?: Record<string, unknown> };
  const code = numero(data.current?.weather_code);
  if (code === null) throw new Error("open-meteo senza weather_code");
  return {
    code,
    temperatura: numero(data.current?.temperature_2m),
    precipitazione: numero(data.current?.precipitation),
    nuvole: numero(data.current?.cloud_cover),
  };
}

export interface MeteoOra {
  /** La categoria che scelgono le ricette. */
  meteo: Meteo | null;
  citta: string | null;
  /** Come si racconta: "31° e sereno", "12° e piove". `null` se manca la temperatura. */
  etichetta: string | null;
}

export async function getMeteo(): Promise<MeteoOra> {
  const [user, loc] = await Promise.all([getViewer(), getViewerLocation()]);
  if (!loc) return { meteo: null, citta: null, etichetta: null };
  // La cache per cella fa quasi tutto il lavoro; il limite è la rete di sicurezza.
  if (user && !(await rateLimit(`meteo:${user.id}`, LIMITE, FINESTRA_S))) {
    return { meteo: null, citta: loc.label, etichetta: null };
  }

  const lat = cella(loc.lat);
  const lng = cella(loc.lng);
  // `unstable_cache` non memorizza una promessa che si rompe: il `catch` sta fuori,
  // così un errore di rete vale `null` e non porta giù la pagina.
  const oss = await unstable_cache(
    () => fetchOsservazione(lat, lng),
    ["meteo", String(lat), String(lng)],
    { revalidate: TTL_S },
  )().catch(() => null);

  if (!oss) return { meteo: null, citta: loc.label, etichetta: null };
  return { meteo: meteoDa(oss), citta: loc.label, etichetta: etichettaMeteo(oss) };
}
