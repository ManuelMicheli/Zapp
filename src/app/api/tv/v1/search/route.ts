import type { NextRequest } from "next/server";
import { instantSearch } from "@/lib/search/instant";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { annoDa } from "@/lib/tv/map";
import type { TitleCard } from "@/lib/tv/dto";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return tvJson({ results: [] });
  return withBearer(request, async () => {
    try {
      const results = await instantSearch(q);
      const cards: TitleCard[] = results.map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        name: r.title,
        year: annoDa(r.year),
        posterPath: r.posterPath,
        backdropPath: null,
        zappScore: r.voteAverage,
        zappVotes: r.votes ?? 0,
        affinity: null,
        reason: null,
        providerIds: r.providers.map((p) => p.id),
      }));
      return tvJson({ results: cards });
    } catch (error) {
      console.error("[tv] search", error);
      return tvJson({ error: "Ricerca non riuscita" }, { status: 502 });
    }
  });
}

export const dynamic = "force-dynamic";
