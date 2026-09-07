import "server-only";

import { unstable_cache } from "next/cache";

const USER_AGENT = `Zapp/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;
const TIMEOUT_MS = 6000;

// Massimo 4 richieste al secondo verso i siti delle catene (stesso schema di
// mymovies/client.ts): sono JSON pubblici non documentati, non vanno martellati.
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

export interface FetchJsonInit {
  headers?: Record<string, string>;
  /** Corpo JSON di una POST (Webtic); entra nella chiave di cache. */
  body?: string;
}

async function rawJson(url: string, init: FetchJsonInit): Promise<unknown> {
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: init.body === undefined ? "GET" : "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[booking] ${res.status} su ${url}`);
      return null;
    }
    const json: unknown = await res.json();
    console.log(`[booking] ok ${url} in ${Date.now() - started} ms`);
    return json;
  } catch (e) {
    console.error(`[booking] errore su ${url}:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Memo in processo davanti alla cache (stesso schema di `tmdb/client.ts`): la stessa
 * chiave chiesta di nuovo nella stessa richiesta riceve la stessa promise, senza un
 * secondo giro nella Data Cache né nel throttle. Senza, il programma di una sala
 * (~15 film) rifaceva per **ogni film** gli stessi elenchi di catena (sale, film,
 * programmazione): 5 sale × 15 film × 3 chiamate = oltre 200 richieste che il
 * limitatore a 4/s serializzava in decine di secondi. Deduplica anche le richieste
 * in volo, che `unstable_cache` da solo non deduplica.
 */
const MEMO_MAX_ENTRIES = 300;
const memo = new Map<string, { expires: number; promise: Promise<unknown> }>();

/**
 * JSON di un endpoint pubblico di una catena (GET, o POST se c'è `init.body`), in
 * `unstable_cache` per URL + corpo con TTL `ttlS`. Timeout 6 s, mai un'eccezione: `null` su qualunque errore (e il
 * `null` non entra in cache: la prossima richiesta riprova).
 */
export async function fetchJson<T>(
  url: string,
  ttlS: number,
  init: FetchJsonInit = {},
): Promise<T | null> {
  const key = `${url}::${init.body ?? ""}`;
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.expires > now) return hit.promise as Promise<T | null>;

  const cached = unstable_cache(
    async () => {
      const json = await rawJson(url, init);
      // Un null in cache bloccherebbe i retry per tutta la TTL: si lancia, così
      // unstable_cache non memorizza e il chiamante riceve null dal catch.
      if (json === null) throw new Error("booking-fetch-failed");
      return json as T;
    },
    ["booking", url, init.body ?? ""],
    { revalidate: ttlS },
  );
  const promise = cached().catch(() => null);

  if (memo.size >= MEMO_MAX_ENTRIES) {
    for (const [k, v] of memo) {
      if (v.expires <= now) memo.delete(k);
    }
    if (memo.size >= MEMO_MAX_ENTRIES) memo.delete(memo.keys().next().value as string);
  }
  // il memo dura quanto la TTL della cache, ma al massimo un minuto: un processo
  // lambda longevo non deve servire una programmazione vecchia
  memo.set(key, { expires: now + Math.min(ttlS, 60) * 1000, promise });
  return promise;
}
