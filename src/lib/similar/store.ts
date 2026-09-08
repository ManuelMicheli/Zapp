import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { parseSimilar, type StoredSimilar } from "./stored";
import type { MediaType, SeedProfile, SimilarItem } from "./types";

export {
  isFresh,
  parseSimilar,
  SIMILAR_EMPTY_TTL_MS,
  SIMILAR_TTL_MS,
  type StoredSimilar,
} from "./stored";

/**
 * La cache condivisa dei consigli (`title_similar`). Stessa idea dei trailer: la
 * classifica di un titolo si calcola una volta e vale per tutti, perché è
 * impersonale — il gusto di chi guarda si applica dopo, in memoria.
 */

export async function readSimilar(
  titleId: number,
  mediaType: MediaType,
): Promise<StoredSimilar | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("title_similar")
    .select("items, computed_at")
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();
  if (error) {
    console.error("[simili] lettura di title_similar fallita:", error.message);
    return null;
  }
  if (!data) return null;
  const items = parseSimilar(data.items);
  if (!items) return null;
  return { items, computedAt: data.computed_at };
}

export async function writeSimilar(
  titleId: number,
  mediaType: MediaType,
  items: SimilarItem[],
  seed: SeedProfile,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("title_similar").upsert(
    {
      title_id: titleId,
      media_type: mediaType,
      items: items as unknown as Json,
      seed: seed as unknown as Json,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "title_id,media_type" },
  );
  // Una scrittura fallita costa il ricalcolo alla prossima visita, non la pagina.
  if (error) console.error("[simili] scrittura di title_similar fallita:", error.message);
}
