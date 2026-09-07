import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { CinemaEntry } from "@/components/cinema/CinemaEntry";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { PosterCard } from "@/components/ui/PosterCard";
import { discoverByGenre, getGenres } from "@/lib/tmdb/client";
import { genreIdsFor } from "@/lib/home/hero-rank";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";

export const metadata = { title: "Scopri" };

interface Props {
  searchParams: Promise<{ type?: string; genre?: string }>;
}

export default async function DiscoverPage({ searchParams }: Props) {
  const { type, genre } = await searchParams;
  const mediaType = type === "tv" ? "tv" : "movie";
  const requested = genre ? Number(genre) : null;
  // TMDB dà id diversi ai generi di film e serie (Azione 28 ↔ Action & Adventure
  // 10759...): passando da Film a Serie con lo stesso id la ricerca tornava vuota.
  const genreId = requested ? (genreIdsFor(mediaType, [requested])[0] ?? null) : null;

  if (genreId && Number.isInteger(genreId)) {
    const [results, genres] = await Promise.all([
      discoverByGenre(mediaType, genreId).catch(() => null),
      getGenres(mediaType).catch(() => null),
    ]);
    const known = genres?.genres.some((g) => g.id === genreId) ?? false;
    const genreName = genres?.genres.find((g) => g.id === genreId)?.name ?? "Genere";
    // I due elenchi non coincidono: Horror, Thriller e Romantico non esistono fra le
    // serie, e viceversa. La pillola porta all'id giusto per l'altro tipo.
    const movieId = genreIdsFor("movie", [genreId])[0];
    const tvId = genreIdsFor("tv", [genreId])[0];
    const items = (results?.results ?? []).filter(
      (r) => r.media_type === "movie" || r.media_type === "tv",
    );

    return (
      <>
        <TopBar title={genreName} />
        <main className="px-5 pb-16 lg:px-10">
          <div className="mb-4 flex gap-2">
            <Link
              href={`/discover?type=movie&genre=${movieId}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                mediaType === "movie"
                  ? "glass-accent text-white"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              Film
            </Link>
            <Link
              href={`/discover?type=tv&genre=${tvId}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                mediaType === "tv"
                  ? "glass-accent text-white"
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
              {known
                ? "Nessun titolo trovato per questo genere."
                : mediaType === "tv"
                  ? "Questo genere non esiste fra le serie TV."
                  : "Questo genere non esiste fra i film."}
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
        <CinemaEntry className="mb-8" />
        <DiscoverSections />
      </main>
    </>
  );
}
