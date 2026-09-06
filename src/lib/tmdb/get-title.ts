import "server-only";

import { cache } from "react";
import { getOrFetchTitle, type CachedTitle } from "./cache";

/**
 * getOrFetchTitle deduplicato per render (generateMetadata + page
 * condividono la stessa promise).
 */
export const getTitleCached = cache(
  (
    id: number,
    mediaType: "movie" | "tv",
    requireFull: boolean,
  ): Promise<CachedTitle | null> => getOrFetchTitle(id, mediaType, { requireFull }),
);
