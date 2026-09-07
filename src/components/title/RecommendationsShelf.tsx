import { PosterCard } from "@/components/ui/PosterCard";
import type { TmdbMultiResult, TmdbPaginated } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";

/**
 * "Simili" in griglia (scelta utente 2026-09-07, mockup "Simili e recensioni C"):
 * nello scaffale orizzontale si vedevano due locandine e mezzo, qui la selezione si
 * legge tutta insieme.
 */
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
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Simili</h2>
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
          />
        ))}
      </div>
    </section>
  );
}
