import { isIntInRange, isMediaType } from "@/lib/validate";
import type { MediaType, WatchStatus } from "./dto";

const STATI: WatchStatus[] = ["watching", "want", "watched", "dropped"];
/** Stesso passo della griglia web (`LIBRARY_PAGE_SIZE`). */
export const LIMITE_MAX = 60;

export function parseLibraryParams(sp: URLSearchParams): {
  status: WatchStatus;
  mediaType: MediaType | null;
  offset: number;
  limit: number;
} {
  const status = sp.get("status");
  const type = sp.get("type");
  const offset = Number(sp.get("offset") ?? 0);
  const limit = Number(sp.get("limit") ?? LIMITE_MAX);
  return {
    status: STATI.includes(status as WatchStatus) ? (status as WatchStatus) : "watching",
    mediaType: isMediaType(type) ? type : null,
    offset: isIntInRange(offset, 0, 100000) ? offset : 0,
    limit: isIntInRange(limit, 1, LIMITE_MAX) ? limit : LIMITE_MAX,
  };
}
