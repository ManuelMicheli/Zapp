import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import type { MediaType } from "./dto";

export type ShelfKey =
  | { kind: "foryou" }
  | { kind: "rail"; key: string }
  | { kind: "because"; mediaType: MediaType; titleId: number }
  | { kind: "topten" }
  | { kind: "want" }
  | { kind: "platform"; providerId: number }
  | { kind: "toprated" }
  | { kind: "comingsoon" };

const FISSE = new Map<string, ShelfKey>([
  ["foryou", { kind: "foryou" }],
  ["topten", { kind: "topten" }],
  ["want", { kind: "want" }],
  ["toprated", { kind: "toprated" }],
  ["comingsoon", { kind: "comingsoon" }],
]);

/**
 * Le rail del motore (`buildRails`): `<dimensione>|<chiave>`, con la chiave opaca —
 * puo' avere spazi e due punti (`persone|Regia:Denis Villeneuve`). La chiave non è
 * validata oltre la lunghezza; una chiave con soli spazi non matcha alcuna rail e
 * produce uno shelf vuoto. Si passa intera a `getHomeRails`; la TV la codifica nel
 * percorso con `encodeURIComponent`.
 */
const RAIL = /^(persone|generi|decenni)\|.{1,100}$/;

export function parseShelfKey(key: string): ShelfKey | null {
  if (!key || key.length > 120) return null;
  const fissa = FISSE.get(key);
  if (fissa) return fissa;
  if (RAIL.test(key)) return { kind: "rail", key };
  const parti = key.split(":");
  if (parti[0] === "because" && parti.length === 3) {
    const id = Number(parti[2]);
    if (!isMediaType(parti[1]) || !isTmdbId(id)) return null;
    return { kind: "because", mediaType: parti[1], titleId: id };
  }
  if (parti[0] === "platform" && parti.length === 2) {
    const id = Number(parti[1]);
    if (!/^[0-9]{1,6}$/.test(parti[1]) || !isIntInRange(id, 1, 999999)) return null;
    return { kind: "platform", providerId: id };
  }
  return null;
}
