import "server-only";

import { consenti, spazza, type Finestra } from "./rate-limit-window";

/**
 * Limiti di frequenza per utente.
 *
 * La decisione pura (la finestra scorrevole) sta in `rate-limit-window.ts`, che
 * non dichiara `server-only` ed e' quindi provabile con Vitest; qui resta
 * l'input/output: Upstash, le variabili d'ambiente, l'orologio.
 */

const memory = new Map<string, Finestra>();

/**
 * La mappa in memoria non si svuotava mai: una chiave per utente e per azione
 * restava li' per sempre, quindi su un'istanza longeva cresceva senza limite.
 * Ogni tanto si passa a togliere le finestre ormai vuote.
 */
const MEMORY_MAX_KEYS = 20_000;
const SWEEP_EVERY_MS = 60_000;
let lastSweep = Date.now();

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
  if (now - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = now;
    spazza(memory, now, windowSeconds, MEMORY_MAX_KEYS);
  }
  const finestra = memory.get(key) ?? { timestamps: [] };
  const ok = consenti(finestra, now, limit, windowSeconds);
  memory.set(key, finestra);
  return ok;
}

export interface OpzioniLimite {
  /**
   * true = il conto vale per **tutta l'applicazione**, non per l'istanza che
   * capita a servire la richiesta.
   *
   * Perche' non e' il default: su Vercel le istanze sono molte, quindi un
   * limite in memoria di 60 al minuto vale 60 *per istanza*. Renderlo esatto
   * costa due comandi Upstash a chiamata, e il piano gratuito ne da' 500.000 al
   * mese: un contatore condiviso sul proxy TMDB o sui "mi piace" lo
   * brucerebbe da solo in pochi giorni.
   *
   * Quindi la regola e': **condiviso dove sbagliare costa fuori di qui** —
   * chiamate a servizi pubblici gratuiti (Nominatim, TMDB) e scritture che gli
   * altri utenti vedono; in memoria dove il limite serve solo a fermare un
   * ciclo impazzito e ogni singola chiamata costa una riga di database.
   */
  condiviso?: boolean;
}

/** true = consentito, false = limite superato. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opzioni: OpzioniLimite = {},
): Promise<boolean> {
  const haUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  if (opzioni.condiviso && haUpstash) {
    try {
      return await upstashLimit(key, limit, windowSeconds);
    } catch {
      return memoryLimit(key, limit, windowSeconds);
    }
  }
  return memoryLimit(key, limit, windowSeconds);
}
