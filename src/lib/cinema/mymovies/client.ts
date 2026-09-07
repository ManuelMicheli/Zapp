import "server-only";

import { unstable_cache } from "next/cache";
import {
  MYMOVIES_BASE,
  MYMOVIES_INDEX_TTL_S,
  MYMOVIES_MAPPA_TTL_S,
  MYMOVIES_PAGE_TTL_S,
} from "@/lib/config";
import { romeDateString } from "../dates";
import { parseCityIndex, parseProvinceIndex } from "./parse";

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

/**
 * Memo in processo davanti alla cache (stesso schema di `tmdb/client.ts` e di
 * `booking/fetch.ts`): indice e pagine vengono chiesti più volte nella stessa
 * richiesta (un `filmSummary` per film, `venuesFor`, la home e `/cinema` nello stesso
 * render). Senza, ogni chiamata ripassava dalla Data Cache e dal limitatore a 4/s.
 * Deduplica anche le richieste in volo, che `unstable_cache` da solo non deduplica.
 */
const MEMO_MAX_ENTRIES = 200;
const memo = new Map<string, { expires: number; promise: Promise<string | null> }>();

function memoized(
  key: string,
  ttlS: number,
  run: () => Promise<string | null>,
): Promise<string | null> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.expires > now) return hit.promise;
  const promise = run().catch(() => null);
  if (memo.size >= MEMO_MAX_ENTRIES) {
    for (const [k, v] of memo) {
      if (v.expires <= now) memo.delete(k);
    }
    if (memo.size >= MEMO_MAX_ENTRIES) memo.delete(memo.keys().next().value as string);
  }
  // al massimo un minuto: un processo lambda longevo non deve servire pagine vecchie
  memo.set(key, { expires: now + Math.min(ttlS, 60) * 1000, promise });
  return promise;
}

// Indice provincia vuoto (notte): memo in processo per 5 min, così le 5–10 chiamate
// per richiesta (film id, sale, slug) non riscaricano 300 KB ciascuna.
const EMPTY_INDEX_MEMO_MS = 5 * 60 * 1000;
const emptyIndexUntil = new Map<string, number>();

/** Le pagine programma cambiano ogni giorno: la data di Roma entra nella chiave. */
export const mymovies = {
  /**
   * Indice provincia. Di notte MyMovies lo serve **senza cinema** (elenca solo le sale
   * col programma di oggi, non ancora pubblicato): un indice vuoto non entra in cache
   * (si lancia, `unstable_cache` non memorizza) e si riprova alla richiesta dopo,
   * invece di restare vuoto per 6 h.
   */
  provinceIndex(prov: string): Promise<string | null> {
    const until = emptyIndexUntil.get(prov);
    if (until && until > Date.now()) return Promise.resolve(null);
    return memoized(`index:${prov}`, MYMOVIES_INDEX_TTL_S, async () => {
      try {
        return await unstable_cache(
          async () => {
            const html = await fetchText(`/cinema/${prov}/provincia/`);
            if (!html || parseProvinceIndex(html).length === 0) {
              throw new Error("mymovies-index-empty");
            }
            return html;
          },
          ["mm-index", prov],
          { revalidate: MYMOVIES_INDEX_TTL_S },
        )();
      } catch {
        emptyIndexUntil.set(prov, Date.now() + EMPTY_INDEX_MEMO_MS);
        return null;
      }
    });
  },
  /**
   * Pagina del capoluogo (`/cinema/<prov>/`): le sale della città, che l'indice
   * provincia non elenca (vedi `parseCityIndex`). Stesse regole dell'indice: vuota di
   * notte, non entra in cache. `null` anche dove il capoluogo non ha una pagina propria.
   */
  cityIndex(prov: string): Promise<string | null> {
    const key = `city:${prov}`;
    const until = emptyIndexUntil.get(key);
    if (until && until > Date.now()) return Promise.resolve(null);
    return memoized(key, MYMOVIES_INDEX_TTL_S, async () => {
      try {
        return await unstable_cache(
          async () => {
            const html = await fetchText(`/cinema/${prov}/`);
            if (!html || parseCityIndex(html).length === 0) {
              throw new Error("mymovies-city-index-empty");
            }
            return html;
          },
          ["mm-city-index", prov],
          { revalidate: MYMOVIES_INDEX_TTL_S },
        )();
      } catch {
        emptyIndexUntil.set(key, Date.now() + EMPTY_INDEX_MEMO_MS);
        return null;
      }
    });
  },
  cinemaPage(path: string): Promise<string | null> {
    return memoized(`cinema:${path}`, MYMOVIES_PAGE_TTL_S, () =>
      unstable_cache(() => fetchText(path), ["mm-cinema", path, romeDateString()], {
        revalidate: MYMOVIES_PAGE_TTL_S,
      })(),
    );
  },
  filmProvincePage(prov: string, filmId: number): Promise<string | null> {
    return memoized(`film:${prov}:${filmId}`, MYMOVIES_PAGE_TTL_S, () =>
      unstable_cache(
        () => fetchText(`/cinema/${prov}/provincia/?f=${filmId}`),
        ["mm-film", prov, String(filmId), romeDateString()],
        { revalidate: MYMOVIES_PAGE_TTL_S },
      )(),
    );
  },
  mappa(cinemaId: number): Promise<string | null> {
    return memoized(`mappa:${cinemaId}`, MYMOVIES_MAPPA_TTL_S, () =>
      unstable_cache(
        () => fetchText(`/ajax/mappe/mappa.asp?sala=${cinemaId}`),
        ["mm-mappa", String(cinemaId)],
        { revalidate: MYMOVIES_MAPPA_TTL_S },
      )(),
    );
  },
};
