import { NextResponse, type NextRequest } from "next/server";
import { searchMulti } from "@/lib/tmdb/client";
import { searchResultTitle, searchResultYear, type SearchItem } from "@/lib/tmdb/mappers";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";

/** Quanti risultati restituire (una pagina TMDB ne ha 20). */
const RESULT_LIMIT = 20;

/**
 * Ricerca istantanea: una chiamata TMDB (cache Next 5 min per query) più una sola
 * query batch sui provider già in cache (`title_providers`, flatrate). Nessun
 * `getOrFetchTitle` per risultato: quello scaricava e salvava il dettaglio di 12
 * titoli a ogni tasto. I provider dei titoli mai aperti compaiono appena qualcuno
 * apre la scheda.
 */
export async function GET(request: NextRequest) {
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
      .slice(0, RESULT_LIMIT);

    const supabase = await createClient();
    const { data: providerRows } = media.length
      ? await supabase
          .from("title_providers")
          .select("title_id, media_type, provider_id, provider_name, logo_path")
          .in(
            "title_id",
            media.map((r) => r.id),
          )
          .eq("kind", "flatrate")
      : { data: [] };

    const providersByKey = new Map<string, SearchItem["providers"]>();
    for (const row of providerRows ?? []) {
      const key = `${row.media_type}:${row.title_id}`;
      const list = providersByKey.get(key) ?? [];
      if (!list.some((p) => p.id === row.provider_id)) {
        list.push({
          id: row.provider_id,
          name: row.provider_name,
          logoPath: row.logo_path,
        });
      }
      providersByKey.set(key, list);
    }

    const items: SearchItem[] = media.map((result) => {
      const mediaType = result.media_type as "movie" | "tv";
      return {
        id: result.id,
        mediaType,
        title: searchResultTitle(result),
        posterPath: result.poster_path ?? null,
        year: searchResultYear(result) ?? null,
        voteAverage: result.vote_average ?? null,
        providers: providersByKey.get(`${mediaType}:${result.id}`) ?? [],
      };
    });

    return NextResponse.json(
      { results: items },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("[api/search] errore:", error);
    return NextResponse.json({ error: "Errore di ricerca" }, { status: 502 });
  }
}
