import type { Json } from "@/types/database";
import type { Trailer } from "./frame";

/**
 * `title_trailers.trailers` dal DB → lista di trailer: null se non è la forma attesa
 * (riga vecchia solo con `keys`, o JSON corrotto), così il chiamante ricalcola.
 */
export function parseTrailers(value: Json): Trailer[] | null {
  if (!Array.isArray(value)) return null;
  const out: Trailer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { key, frame } = item as { key?: unknown; frame?: unknown };
    if (typeof key !== "string" || !frame || typeof frame !== "object") return null;
    const f = frame as Record<string, unknown>;
    const nums = [f.x, f.y, f.w, f.h];
    if (!nums.every((n) => typeof n === "number")) return null;
    const [x, y, w, h] = nums as number[];
    out.push({ key, frame: { x, y, w, h } });
  }
  return out;
}
