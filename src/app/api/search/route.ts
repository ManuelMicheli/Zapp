import { NextResponse, type NextRequest } from "next/server";
import { searchMulti } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import {
  searchResultTitle,
  searchResultYear,
  type SearchItem,
} from "@/lib/tmdb/mappers";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";

/** Quanti risultati arricchire con i provider (una fetch dettaglio ciascuno, cache 7gg). */
const ENRICH_LIMIT = 12;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const search = await searchMulti(query);
    const media = search.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, ENRICH_LIMIT);

    const items: SearchItem[] = await Promise.all(
      media.map(async (result) => {
        const mediaType = result.media_type as "movie" | "tv";
        const cached = await getOrFetchTitle(result.id, mediaType);
        const flatrate = (cached?.providers ?? []).filter((p) => p.kind === "flatrate");
        return {
          id: result.id,
          mediaType,
          title: cached?.title.title ?? searchResultTitle(result),
          posterPath: cached?.title.poster_path ?? result.poster_path ?? null,
          year:
            (cached?.title.release_date
              ? cached.title.release_date.slice(0, 4)
              : searchResultYear(result)) ?? null,
          voteAverage: cached?.title.vote_average ?? result.vote_average ?? null,
          providers: flatrate.map((p) => ({
            id: p.provider_id,
            name: p.provider_name,
            logoPath: p.logo_path,
          })),
        };
      }),
    );

    return NextResponse.json({ results: items });
  } catch (error) {
    console.error("[api/search] errore:", error);
    return NextResponse.json({ error: "Errore di ricerca" }, { status: 502 });
  }
}
