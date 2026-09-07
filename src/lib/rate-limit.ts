import "server-only";

/**
 * Rate limiting per utente. Se UPSTASH_REDIS_REST_URL/TOKEN sono configurati
 * usa Upstash (consigliato in produzione multi-istanza), altrimenti sliding
 * window in memoria (sufficiente per singola istanza / sviluppo).
 */

interface Window {
  timestamps: number[];
}

const memory = new Map<string, Window>();

/**
 * La mappa in memoria non si svuotava mai: una chiave per utente e per azione
 * restava li' per sempre, quindi su un'istanza longeva cresceva senza limite.
 * Ogni tanto si passa a togliere le finestre ormai vuote, e se restano troppe
 * chiavi si riparte da zero (perdere lo stato del limitatore vale molto meno
 * che tenere in piedi il processo).
 */
const MEMORY_MAX_KEYS = 20_000;
const SWEEP_EVERY_MS = 60_000;
let lastSweep = Date.now();

function sweep(now: number, windowSeconds: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  const cutoff = now - windowSeconds * 1000;
  for (const [key, win] of memory) {
    if (win.timestamps.length === 0 || win.timestamps[win.timestamps.length - 1] <= cutoff) {
      memory.delete(key);
    }
  }
  if (memory.size > MEMORY_MAX_KEYS) memory.clear();
}

async function upstashLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  // INCR + EXPIRE NX in pipeline
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", `rl:${key}`],
      ["EXPIRE", `rl:${key}`, String(windowSeconds), "NX"],
    ]),
    cache: "no-store",
  });
  // Upstash giù: si scende al limitatore in memoria invece di lasciare passare
  // tutto. Una finestra per istanza vale meno di una distribuita, ma un tetto
  // c'è comunque.
  if (!res.ok) return memoryLimit(key, limit, windowSeconds);
  const data = (await res.json()) as { result: number }[];
  return (data[0]?.result ?? 0) <= limit;
}

function memoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  sweep(now, windowSeconds);
  const cutoff = now - windowSeconds * 1000;
  const win = memory.get(key) ?? { timestamps: [] };
  win.timestamps = win.timestamps.filter((t) => t > cutoff);
  if (win.timestamps.length >= limit) {
    memory.set(key, win);
    return false;
  }
  win.timestamps.push(now);
  memory.set(key, win);
  return true;
}

/** true = consentito, false = limite superato. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashLimit(key, limit, windowSeconds);
    } catch {
      return memoryLimit(key, limit, windowSeconds);
    }
  }
  return memoryLimit(key, limit, windowSeconds);
}
