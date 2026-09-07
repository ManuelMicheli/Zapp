import "server-only";

import { parseMdblistRatings } from "./parse";
import type { SourceValues } from "./types";

const BASE = "https://api.mdblist.com";
const TIMEOUT_MS = 8000;

// Massimo 4 richieste al secondo (stesso schema di tmdb/client.ts e mymovies/client.ts).
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

/** Quota giornaliera finita: il job si ferma, non ritenta a raffica. */
export class MdblistQuotaError extends Error {
  constructor(readonly retryAfterS: number) {
    super(`MDBList: quota esaurita, riprovare fra ${retryAfterS} s`);
    this.name = "MdblistQuotaError";
  }
}

function apiKey(): string {
  const key = process.env.MDBLIST_API_KEY;
  if (!key || key.startsWith("INSERISCI")) {
    throw new Error("MDBLIST_API_KEY mancante in .env.local");
  }
  return key;
}

/**
 * Lotti: 100 sul piano Supporter. Il limite vero non è documentato in modo netto,
 * quindi se il server rifiuta la richiesta si scende di gradino e ci si resta.
 */
const SIZES = [100, 50, 10] as const;
let sizeIndex = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** La risposta può essere un array o incapsulata: proviamo le forme note. */
function itemsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of ["items", "results", "data", "media"]) {
    const v = payload[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

async function postBatch(
  ids: number[],
  path: string,
): Promise<{ ok: true; items: unknown[] } | { ok: false; tooBig: boolean }> {
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      throw new MdblistQuotaError(Number(res.headers.get("Retry-After")) || 3600);
    }
    if (res.status === 400 || res.status === 413 || res.status === 422) {
      console.error(`[mdblist] lotto da ${ids.length} rifiutato (${res.status})`);
      return { ok: false, tooBig: true };
    }
    if (!res.ok) {
      console.error(`[mdblist] ${res.status} su ${path}`);
      return { ok: false, tooBig: false };
    }
    return { ok: true, items: itemsOf(await res.json()) };
  } catch (e) {
    if (e instanceof MdblistQuotaError) throw e;
    console.error(`[mdblist] errore su ${path}:`, e);
    return { ok: false, tooBig: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Voti di più titoli in una coda che si accorcia da sé. Gli id sono id TMDB.
 * `found` ha solo i titoli che MDBList conosce; `answered` ha tutti gli id per cui
 * è arrivata una risposta (conosciuti o no) — chi chiama distingue così un "non lo
 * conosce" (da segnare `mdblist_miss`) da un "la richiesta è fallita" (da ritentare
 * al giro dopo, senza marchiare nulla).
 */
export async function fetchRatingsBatch(
  ids: number[],
  mediaType: "movie" | "tv",
): Promise<{ found: Map<number, SourceValues>; answered: Set<number> }> {
  const path = `/tmdb/${mediaType === "tv" ? "show" : "movie"}/`;
  const found = new Map<number, SourceValues>();
  const answered = new Set<number>();
  let pending = [...ids];

  while (pending.length > 0) {
    const size = SIZES[sizeIndex];
    const group = pending.slice(0, size);
    const res = await postBatch(group, path);

    if (res.ok) {
      collect(res.items, found);
      // Il lotto ha avuto risposta: questi id sono "noti o assenti", non "non chiesti"
      for (const id of group) answered.add(id);
      pending = pending.slice(size);
      continue;
    }

    // Lotto troppo grande e c'è ancora un gradino sotto: si riprova la STESSA coda più corta
    if (res.tooBig && sizeIndex < SIZES.length - 1) {
      sizeIndex += 1;
      continue;
    }

    // Gradino minimo o errore non recuperabile: si salta il gruppo, ma lo si dichiara
    console.error(
      `[mdblist] gruppo di ${group.length} id saltato (lotto ${size}, tooBig=${res.tooBig})`,
    );
    pending = pending.slice(size);
  }

  return { found, answered };
}

function collect(items: unknown[], out: Map<number, SourceValues>): void {
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "number" ? item.id : null;
    if (id === null) continue;
    const values = parseMdblistRatings(item);
    if (Object.keys(values).length > 0) out.set(id, values);
  }
}
