import Link from "next/link";
import { MAIN_PROVIDER_IDS } from "@/lib/config";
import { discoverNewOnStreaming, getGenres, getTrending } from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import { PosterCard } from "@/components/ui/PosterCard";
import { HorizontalShelf } from "./HorizontalShelf";

function ShelfItems({ items }: { items: TmdbMultiResult[] }) {
  return (
    <>
      {items
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            className="w-28 shrink-0"
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
          />
        ))}
    </>
  );
}

export async function DiscoverSections() {
  const [trending, newMovies, newTv, movieGenres] = await Promise.all([
    getTrending().catch(() => null),
    discoverNewOnStreaming("movie", MAIN_PROVIDER_IDS).catch(() => null),
    discoverNewOnStreaming("tv", MAIN_PROVIDER_IDS).catch(() => null),
    getGenres("movie").catch(() => null),
  ]);

  const newOnStreaming = [
    ...(newMovies?.results.slice(0, 10) ?? []),
    ...(newTv?.results.slice(0, 10) ?? []),
  ].sort((a, b) => {
    const dateA =
      (a.media_type === "movie"
        ? a.release_date
        : a.media_type === "tv"
          ? a.first_air_date
          : "") ?? "";
    const dateB =
      (b.media_type === "movie"
        ? b.release_date
        : b.media_type === "tv"
          ? b.first_air_date
          : "") ?? "";
    return dateB.localeCompare(dateA);
  });

  return (
    <div className="space-y-8">
      {trending && trending.results.length > 0 && (
        <HorizontalShelf title="Di tendenza questa settimana">
          <ShelfItems items={trending.results.slice(0, 15)} />
        </HorizontalShelf>
      )}

      {newOnStreaming.length > 0 && (
        <HorizontalShelf title="Nuovi su streaming">
          <ShelfItems items={newOnStreaming} />
        </HorizontalShelf>
      )}

      {movieGenres && movieGenres.genres.length > 0 && (
        <section>
          <h2 className="mb-2 px-4 text-base font-bold">Per genere</h2>
          <div className="flex flex-wrap gap-2 px-4">
            {movieGenres.genres.map((g) => (
              <Link
                key={g.id}
                href={`/discover?type=movie&genre=${g.id}`}
                className="flex h-9 items-center justify-center whitespace-nowrap rounded-full border border-white/[0.08] bg-surface-2 px-3.5 text-[13px] font-medium transition-colors hover:border-white/20"
              >
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
