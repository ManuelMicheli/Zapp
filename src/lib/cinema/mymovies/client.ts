import "server-only";

import { unstable_cache } from "next/cache";
import {
  MYMOVIES_BASE,
  MYMOVIES_INDEX_TTL_S,
  MYMOVIES_MAPPA_TTL_S,
  MYMOVIES_PAGE_TTL_S,
} from "@/lib/config";
import { romeDateString } from "../dates";

const USER_AGENT = `Zapp/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;
// Timeout regolabile da env per diagnosi (MYMOVIES_TIMEOUT_MS); default 8 s.
const TIMEOUT_MS = Number(process.env.MYMOVIES_TIMEOUT_MS) || 8000;

// Massimo 4 richieste al secondo verso MyMovies (stesso schema di tmdb/client.ts):
// un carico a freddo (indice + 10 mappe + 5 programmi) deve stare sotto i 10 s di Vercel.
const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 4;
let windowStart = Date.now();
let windowCount = 0;
async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount < MAX_PER_WINDOW) {
      windowCount += 1;
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - windowStart) + 5));
  }
}

/** GET di una pagina pubblica: `null` su errore o timeout, mai un'eccezione. */
async function fetchText(path: string): Promise<string | null> {
  // il timer parte dopo il throttle: l'attesa in coda non consuma il timeout
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  console.log(`[mymovies] fetch ${path}`);
  try {
    const res = await fetch(`${MYMOVIES_BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mymovies] ${res.status} su ${path}`);
      return null;
    }
    const text = await res.text();
    console.log(
      `[mymovies] ok ${path} ${text.length} byte in ${Date.now() - started} ms`,
    );
    return text;
  } catch (e) {
    console.error(`[mymovies] errore su ${path} dopo ${Date.now() - started} ms:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Le pagine programma cambiano ogni giorno: la data di Roma entra nella chiave. */
export const mymovies = {
  provinceIndex(prov: string): Promise<string | null> {
    return unstable_cache(
      () => fetchText(`/cinema/${prov}/provincia/`),
      ["mm-index", prov],
      {
        revalidate: MYMOVIES_INDEX_TTL_S,
      },
    )();
  },
  cinemaPage(path: string): Promise<string | null> {
    return unstable_cache(() => fetchText(path), ["mm-cinema", path, romeDateString()], {
      revalidate: MYMOVIES_PAGE_TTL_S,
    })();
  },
  filmProvincePage(prov: string, filmId: number): Promise<string | null> {
    return unstable_cache(
      () => fetchText(`/cinema/${prov}/provincia/?f=${filmId}`),
      ["mm-film", prov, String(filmId), romeDateString()],
      { revalidate: MYMOVIES_PAGE_TTL_S },
    )();
  },
  mappa(cinemaId: number): Promise<string | null> {
    return unstable_cache(
      () => fetchText(`/ajax/mappe/mappa.asp?sala=${cinemaId}`),
      ["mm-mappa", String(cinemaId)],
      { revalidate: MYMOVIES_MAPPA_TTL_S },
    )();
  },
};
