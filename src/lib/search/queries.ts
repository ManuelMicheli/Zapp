import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";

/** Quante voci mostrare sotto la barra di ricerca. */
export const RECENT_SEARCH_LIMIT = 12;

export interface RecentSearch {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: number | null;
}

/**
 * I titoli aperti dalla ricerca, dal piu' recente. Una query sola: titolo,
 * locandina e anno stanno nella riga, quindi niente join su `titles` e niente
 * chiamate TMDB per una lista che deve comparire appena si tocca la barra.
 */
export async function getRecentSearches(): Promise<RecentSearch[]> {
  const viewer = await getViewer();
  if (!viewer) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_history")
    .select("title_id, media_type, title, poster_path, year")
    .order("searched_at", { ascending: false })
    .limit(RECENT_SEARCH_LIMIT);

  if (error) {
    console.error("getRecentSearches", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.title_id,
    mediaType: row.media_type,
    title: row.title,
    posterPath: row.poster_path,
    year: row.year,
  }));
}
