import Link from "next/link";
import { MAIN_PROVIDER_IDS } from "@/lib/config";
import {
  discoverNewOnStreaming,
  discoverTopRated,
  getGenres,
  getMovieList,
  getTrending,
  getTvList,
} from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import { PosterCard } from "@/components/ui/PosterCard";
import { HomeTypeGate, HomeTypeSwap, type HomeType } from "@/components/home/HomeType";
import { HorizontalShelf } from "./HorizontalShelf";

const SHELF_SIZE = 20;

function ShelfItems({ items }: { items: TmdbMultiResult[] }) {
  return (
    <>
      {items
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .filter((r) => r.poster_path)
        .slice(0, SHELF_SIZE)
        .map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            className="w-28 shrink-0 lg:w-[140px]"
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
          />
        ))}
    </>
  );
}

type ShelfProps = {
  title: string;
  items: TmdbMultiResult[] | undefined;
  seeAllHref?: string;
  /** In home ogni scaffale è diviso per tipo e mostrato solo alla scheda giusta. */
  byType?: boolean;
};

function OneShelf({ title, items, seeAllHref, type }: ShelfProps & { type?: HomeType }) {
  const mine = type ? (items ?? []).filter((r) => r.media_type === type) : (items ?? []);
  if (mine.length === 0) return null;
  const shelf = (
    <HorizontalShelf title={title} seeAllHref={seeAllHref}>
      <ShelfItems items={mine} />
    </HorizontalShelf>
  );
  return type ? <HomeTypeGate type={type}>{shelf}</HomeTypeGate> : shelf;
}

function Shelf({ byType, ...props }: ShelfProps) {
  if (!byType) return <OneShelf {...props} />;
  return (
    <>
      <OneShelf {...props} type="movie" />
      <OneShelf {...props} type="tv" />
    </>
  );
}

function GenreChips({
  genres,
  type,
}: {
  genres: { id: number; name: string }[];
  type: HomeType;
}) {
  if (genres.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 px-5 text-xl font-bold tracking-[-0.03em] lg:px-10">
        Per genere
      </h2>
      <div className="flex flex-wrap gap-2 px-5 lg:px-10">
        {genres.map((g) => (
          <Link
            key={g.id}
            href={`/discover?type=${type}&genre=${g.id}`}
            className="flex h-9 items-center justify-center whitespace-nowrap rounded-full border border-white/[0.08] bg-surface-2 px-3.5 text-[13px] font-medium transition-colors hover:border-white/20"
          >
            {g.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function releaseDate(r: TmdbMultiResult): string {
  if (r.media_type === "movie") return r.release_date ?? "";
  if (r.media_type === "tv") return r.first_air_date ?? "";
  return "";
}

/**
 * Scaffali "Scopri" alimentati da TMDB (cache Next 1h per endpoint).
 * Ogni chiamata fallisce in modo indipendente: uno scaffale mancante non
 * nasconde gli altri.
 * Con `byType` (home) ogni scaffale è diviso in film e serie: si vede solo la
 * metà della scheda scelta in testata, senza tornare al server.
 */
export async function DiscoverSections({ byType = false }: { byType?: boolean } = {}) {
  const [
    trending,
    nowPlaying,
    newMovies,
    newTv,
    tvPopular,
    moviePopular,
    movieTop,
    tvTop,
    upcoming,
    movieGenres,
    tvGenres,
  ] = await Promise.all([
    getTrending().catch(() => null),
    getMovieList("now_playing").catch(() => null),
    discoverNewOnStreaming("movie", MAIN_PROVIDER_IDS).catch(() => null),
    discoverNewOnStreaming("tv", MAIN_PROVIDER_IDS).catch(() => null),
    getTvList("popular").catch(() => null),
    getMovieList("popular").catch(() => null),
    discoverTopRated("movie").catch(() => null),
    discoverTopRated("tv").catch(() => null),
    getMovieList("upcoming").catch(() => null),
    getGenres("movie").catch(() => null),
    getGenres("tv").catch(() => null),
  ]);

  const newOnStreaming = [
    ...(newMovies?.results.slice(0, 10) ?? []),
    ...(newTv?.results.slice(0, 10) ?? []),
  ].sort((a, b) => releaseDate(b).localeCompare(releaseDate(a)));

  // "In arrivo": solo titoli non ancora usciti, dal più vicino.
  const today = new Date().toISOString().slice(0, 10);
  const comingSoon = (upcoming?.results ?? [])
    .filter((r) => releaseDate(r) > today)
    .sort((a, b) => releaseDate(a).localeCompare(releaseDate(b)));

  return (
    <div className="space-y-8">
      <Shelf
        title="Di tendenza questa settimana"
        items={trending?.results}
        byType={byType}
      />
      <Shelf
        title="Al cinema adesso"
        items={nowPlaying?.results}
        seeAllHref="/cinema"
        byType={byType}
      />
      <Shelf title="Nuovi su streaming" items={newOnStreaming} byType={byType} />
      <Shelf title="Serie del momento" items={tvPopular?.results} byType={byType} />
      <Shelf title="Film più popolari" items={moviePopular?.results} byType={byType} />
      <Shelf title="Film più amati di sempre" items={movieTop?.results} byType={byType} />
      <Shelf title="Serie più amate di sempre" items={tvTop?.results} byType={byType} />
      <Shelf title="In arrivo" items={comingSoon} byType={byType} />

      <HomeTypeSwap
        movie={<GenreChips genres={movieGenres?.genres ?? []} type="movie" />}
        tv={<GenreChips genres={tvGenres?.genres ?? []} type="tv" />}
      />
    </div>
  );
}
