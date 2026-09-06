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

async function rawJson(url: string, headers: Record<string, string>): Promise<unknown> {
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
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
 * GET JSON di un endpoint pubblico di una catena, in `unstable_cache` per URL con
 * TTL `ttlS`. Timeout 6 s, mai un'eccezione: `null` su qualunque errore (e il
 * `null` non entra in cache: la prossima richiesta riprova).
 */
export async function fetchJson<T>(
  url: string,
  ttlS: number,
  headers: Record<string, string> = {},
): Promise<T | null> {
  const cached = unstable_cache(
    async () => {
      const json = await rawJson(url, headers);
      // Un null in cache bloccherebbe i retry per tutta la TTL: si lancia, così
      // unstable_cache non memorizza e il chiamante riceve null dal catch.
      if (json === null) throw new Error("booking-fetch-failed");
      return json as T;
    },
    ["booking", url],
    { revalidate: ttlS },
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}
