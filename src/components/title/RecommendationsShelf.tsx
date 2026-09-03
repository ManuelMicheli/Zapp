import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { PosterCard } from "@/components/ui/PosterCard";
import type { TmdbMultiResult, TmdbPaginated } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";

export function RecommendationsShelf({
  recommendations,
}: {
  recommendations: TmdbPaginated<TmdbMultiResult> | undefined;
}) {
  const items = (recommendations?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 12);
  if (items.length === 0) return null;

  return (
    <HorizontalShelf title="Simili">
      {items.map((item) => (
        <PosterCard
          key={`${item.media_type}-${item.id}`}
          className="w-28 shrink-0"
          title={searchResultTitle(item)}
          posterPath={item.poster_path ?? null}
          year={searchResultYear(item)}
          href={`/title/${item.media_type}/${item.id}`}
        />
      ))}
    </HorizontalShelf>
  );
}
