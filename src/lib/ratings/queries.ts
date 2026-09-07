import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Confidence, SourceValues } from "./types";

export interface StoredRating {
  score: number | null;
  votes: number;
  critics: number;
  confidence: Confidence;
  sources: SourceValues;
}

export interface TitleKey {
  id: number;
  mediaType: "movie" | "tv";
}

/** Chiave della mappa: i titoli hanno id uguali fra film e serie. */
export function ratingKey(id: number, mediaType: "movie" | "tv"): string {
  return `${mediaType}-${id}`;
}

/**
 * Voti di più titoli in una query sola: le liste non devono mai chiedere riga per
 * riga. Le righe pesano circa 200 byte, quindi si possono chiedere tutte insieme
 * senza avvicinarsi al problema di `titles.raw`.
 */
export const getRatings = cache(
  async (keys: TitleKey[]): Promise<Map<string, StoredRating>> => {
    const out = new Map<string, StoredRating>();
    if (keys.length === 0) return out;

    const supabase = await createClient();
    const ids = [...new Set(keys.map((k) => k.id))];
    const { data, error } = await supabase
      .from("title_ratings")
      .select(
        "title_id, media_type, zapp_score, zapp_votes, zapp_critics, confidence, sources",
      )
      .in("title_id", ids);
    if (error) {
      // Senza questo log un errore qui sarebbe indistinguibile da "nessun titolo ha
      // ancora un voto": la pagina ricadrebbe sul voto TMDB e nessuno saprebbe perché
      console.error("[ratings] voti non letti:", error.message);
    }

    for (const row of data ?? []) {
      out.set(ratingKey(row.title_id, row.media_type), {
        score: row.zapp_score === null ? null : Number(row.zapp_score),
        votes: Number(row.zapp_votes),
        critics: row.zapp_critics,
        confidence: row.confidence as Confidence,
        sources: (row.sources ?? {}) as SourceValues,
      });
    }
    return out;
  },
);
