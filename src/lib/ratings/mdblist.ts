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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
 * Voti di più titoli in una sola richiesta per lotto. Gli id sono id TMDB.
 * Un titolo che MDBList non conosce semplicemente non compare nella mappa:
 * chi chiama lo segna come `mdblist_miss` e non lo richiede per un mese.
 */
export async function fetchRatingsBatch(
  ids: number[],
  mediaType: "movie" | "tv",
): Promise<Map<number, SourceValues>> {
  const path = `/tmdb/${mediaType === "tv" ? "show" : "movie"}/`;
  const out = new Map<number, SourceValues>();
  if (ids.length === 0) return out;

  for (const group of chunk(ids, SIZES[sizeIndex])) {
    const res = await postBatch(group, path);
    if (!res.ok && res.tooBig && sizeIndex < SIZES.length - 1) {
      sizeIndex += 1;
      for (const smaller of chunk(group, SIZES[sizeIndex])) {
        const retry = await postBatch(smaller, path);
        if (retry.ok) collect(retry.items, out);
      }
      continue;
    }
    if (res.ok) collect(res.items, out);
  }
  return out;
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
