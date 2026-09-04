import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { PosterCard } from "@/components/ui/PosterCard";
import { discoverByGenre, getGenres } from "@/lib/tmdb/client";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";

export const metadata = { title: "Scopri" };

interface Props {
  searchParams: Promise<{ type?: string; genre?: string }>;
}

export default async function DiscoverPage({ searchParams }: Props) {
  const { type, genre } = await searchParams;
  const mediaType = type === "tv" ? "tv" : "movie";
  const genreId = genre ? Number(genre) : null;

  if (genreId && Number.isInteger(genreId)) {
    const [results, genres] = await Promise.all([
      discoverByGenre(mediaType, genreId).catch(() => null),
      getGenres(mediaType).catch(() => null),
    ]);
    const genreName = genres?.genres.find((g) => g.id === genreId)?.name ?? "Genere";
    const items = (results?.results ?? []).filter(
      (r) => r.media_type === "movie" || r.media_type === "tv",
    );

    return (
      <>
        <TopBar title={genreName} />
        <main className="px-5 pb-16 lg:px-10">
          <div className="mb-4 flex gap-2">
            <Link
              href={`/discover?type=movie&genre=${genreId}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                mediaType === "movie"
                  ? "bg-accent text-white"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              Film
            </Link>
            <Link
              href={`/discover?type=tv&genre=${genreId}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                mediaType === "tv"
                  ? "bg-accent text-white"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              Serie
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
          {items.length === 0 && (
            <p className="mt-12 text-center text-sm text-muted">
              Nessun titolo trovato per questo genere.
            </p>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Scopri" />
      <main className="pb-16">
        <DiscoverSections />
      </main>
    </>
  );
}
