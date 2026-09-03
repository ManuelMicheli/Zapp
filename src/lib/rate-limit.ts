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
  if (!res.ok) return true; // Upstash giù: non bloccare gli utenti
  const data = (await res.json()) as { result: number }[];
  return (data[0]?.result ?? 0) <= limit;
}

function memoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
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
