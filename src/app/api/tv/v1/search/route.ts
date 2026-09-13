import type { NextRequest } from "next/server";
import { instantSearch } from "@/lib/search/instant";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { annoDa } from "@/lib/tv/map";
import type { SearchResponse, TitleCard } from "@/lib/tv/dto";

export async function GET(request: NextRequest) {
  return withBearer(request, async () => {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2 || q.length > 100) return tvJson({ results: [] });
    try {
      const results = await instantSearch(q);
      const cards: TitleCard[] = results.map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        name: r.title,
        year: annoDa(r.year),
        posterPath: r.posterPath,
        backdropPath: null,
        // `instantSearch` scrive `votes` solo quando ha sostituito il voto TMDB
        // con lo ZappScore (title_ratings); senza quella riga `voteAverage`
        // resta il voto TMDB grezzo, che qui non e' lo ZappScore del DTO.
        zappScore: r.votes == null ? null : r.voteAverage,
        zappVotes: r.votes ?? 0,
        affinity: null,
        reason: null,
        providerIds: r.providers.map((p) => p.id),
      }));
      const body: SearchResponse = { results: cards };
      return tvJson(body);
    } catch (error) {
      console.error("[tv] search", error);
      return tvJson({ error: "Ricerca non riuscita" }, { status: 502 });
    }
  });
}

export const dynamic = "force-dynamic";
