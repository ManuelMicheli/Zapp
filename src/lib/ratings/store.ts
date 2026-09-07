import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { fetchRatingsBatch, MdblistQuotaError } from "./mdblist";
import { zappScore } from "./score";
import { ratingKey, type StoredRating } from "./queries";
import type { SourceValues } from "./types";

/** Quanto vale una riga prima di richiederla: 7 giorni per i titoli che contano. */
export const RATINGS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Un titolo che MDBList non conosce si riprova dopo un mese, non a ogni giro. */
export const RATINGS_MISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Scrive i voti trovati e segna come `mdblist_miss` quelli chiesti e non tornati.
 * Ritorna quante righe sono state scritte.
 */
export async function saveRatings(
  mediaType: "movie" | "tv",
  found: Map<number, SourceValues>,
  asked: number[],
): Promise<number> {
  if (asked.length === 0) return 0;
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const rows = asked.map((id) => {
    const sources = found.get(id) ?? {};
    const score = zappScore(sources);
    return {
      title_id: id,
      media_type: mediaType,
      sources: sources as unknown as Json,
      zapp_score: score.score,
      zapp_votes: score.votes,
      zapp_critics: score.critics,
      confidence: score.confidence,
      mdblist_miss: !found.has(id),
      fetched_at: now,
    };
  });

  const { error } = await supabase
    .from("title_ratings")
    .upsert(rows, { onConflict: "title_id,media_type" });
  if (error) {
    console.error("[ratings] upsert fallito:", error.message);
    return 0;
  }
  return rows.length;
}

/**
 * Riempimento pigro della scheda titolo: se la riga manca o è scaduta la chiede al
 * volo (una richiesta sola). Sta dentro il `Suspense` della scheda, quindi non
 * rallenta il primo chunk. Qualunque errore torna la riga vecchia, o `null`.
 */
export async function ensureRatings(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<StoredRating | null> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("title_ratings")
    .select(
      "zapp_score, zapp_votes, zapp_critics, confidence, sources, mdblist_miss, fetched_at",
    )
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  const age = row ? Date.now() - new Date(row.fetched_at).getTime() : Infinity;
  const ttl = row?.mdblist_miss ? RATINGS_MISS_TTL_MS : RATINGS_TTL_MS;
  const stored: StoredRating | null = row
    ? {
        score: row.zapp_score === null ? null : Number(row.zapp_score),
        votes: Number(row.zapp_votes),
        critics: row.zapp_critics,
        confidence: row.confidence as StoredRating["confidence"],
        sources: (row.sources ?? {}) as SourceValues,
      }
    : null;

  if (row && age < ttl) return stored;

  try {
    const found = await fetchRatingsBatch([titleId], mediaType);
    await saveRatings(mediaType, found, [titleId]);
    const sources = found.get(titleId) ?? {};
    const score = zappScore(sources);
    return {
      score: score.score,
      votes: score.votes,
      critics: score.critics,
      confidence: score.confidence,
      sources,
    };
  } catch (e) {
    if (!(e instanceof MdblistQuotaError)) console.error("[ratings] fetch fallito:", e);
    // Quota finita o rete giù: si tiene quello che c'è, la UI ricade su TMDB
    return stored;
  }
}

/** Riesporta la chiave della mappa per chi importa solo da `store`. */
export { ratingKey };
