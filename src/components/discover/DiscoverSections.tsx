import Link from "next/link";
import { MAIN_PROVIDER_IDS, PROVIDERS } from "@/lib/config";
import {
  discoverNewOnStreaming,
  getGenres,
  getMovieList,
  getTrending,
  getTvList,
} from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import {
  getChartBadges,
  getProviderChart,
  getRisingChart,
  getTopRatedOnZapp,
  type ChartItem,
} from "@/lib/charts/queries";
import { PosterCard } from "@/components/ui/PosterCard";
import { HomeTypeGate, HomeTypeSwap, type HomeType } from "@/components/home/HomeType";
import { HorizontalShelf } from "./HorizontalShelf";

const SHELF_SIZE = 20;

type ChartBadges = Map<string, { rank: number; providerName: string; rising: boolean }>;

function ShelfItems({
  items,
  badges,
}: {
  items: TmdbMultiResult[];
  badges?: ChartBadges;
}) {
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
            chartBadge={badges?.get(`${item.media_type}-${item.id}`) ?? null}
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
  /** Posizione in classifica dei titoli mostrati, calcolata una volta per pagina. */
  badges?: ChartBadges;
};

function OneShelf({
  title,
  items,
  seeAllHref,
  badges,
  type,
}: ShelfProps & { type?: HomeType }) {
  const mine = type ? (items ?? []).filter((r) => r.media_type === type) : (items ?? []);
  if (mine.length === 0) return null;
  const shelf = (
    <HorizontalShelf title={title} seeAllHref={seeAllHref}>
      <ShelfItems items={mine} badges={badges} />
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

/**
 * Scaffale di classifica: parla di `ChartItem` (voto Zapp, posizione, provider),
 * mai di `TmdbMultiResult` che ha una forma diversa — non vanno mescolati.
 */
function ChartShelf({
  title,
  items,
  byType,
  showRank,
}: {
  title: string;
  items: ChartItem[];
  byType: boolean;
  /** La pillola con la posizione: solo per gli scaffali che sono davvero una classifica. */
  showRank: boolean;
}) {
  if (items.length === 0) return null;

  const one = (type?: HomeType) => {
    const mine = type ? items.filter((i) => i.mediaType === type) : items;
    if (mine.length === 0) return null;
    const shelf = (
      <HorizontalShelf title={title}>
        {mine.slice(0, SHELF_SIZE).map((i) => (
          <PosterCard
            key={`${i.mediaType}-${i.id}`}
            className="w-28 shrink-0 lg:w-[140px]"
            title={i.title}
            posterPath={i.posterPath}
            year={i.year}
            rating={i.score}
            href={`/title/${i.mediaType}/${i.id}`}
            chartBadge={
              showRank
                ? {
                    rank: i.rank,
                    providerName: PROVIDERS[i.providerId]?.name ?? "streaming",
                    rising: (i.momentum ?? 0) >= 2,
                  }
                : null
            }
          />
        ))}
      </HorizontalShelf>
    );
    return type ? <HomeTypeGate type={type}>{shelf}</HomeTypeGate> : shelf;
  };

  if (!byType) return one();
  return (
    <>
      {one("movie")}
      {one("tv")}
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
    upcoming,
    movieGenres,
    tvGenres,
    netflixChart,
    primeChart,
    disneyChart,
    appleChart,
    rising,
    topMovies,
    topTv,
  ] = await Promise.all([
    getTrending().catch(() => null),
    getMovieList("now_playing").catch(() => null),
    discoverNewOnStreaming("movie", MAIN_PROVIDER_IDS).catch(() => null),
    discoverNewOnStreaming("tv", MAIN_PROVIDER_IDS).catch(() => null),
    getTvList("popular").catch(() => null),
    getMovieList("popular").catch(() => null),
    getMovieList("upcoming").catch(() => null),
    getGenres("movie").catch(() => null),
    getGenres("tv").catch(() => null),
    getProviderChart(8).catch(() => []),
    getProviderChart(119).catch(() => []),
    getProviderChart(337).catch(() => []),
    getProviderChart(350).catch(() => []),
    getRisingChart().catch(() => []),
    getTopRatedOnZapp("movie").catch(() => []),
    getTopRatedOnZapp("tv").catch(() => []),
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

  // Una query sola per tutta la pagina: la posizione in classifica di ogni titolo
  // che compare negli scaffali TMDB.
  const shown = [
    trending?.results,
    nowPlaying?.results,
    newOnStreaming,
    tvPopular?.results,
    moviePopular?.results,
    comingSoon,
  ]
    .flatMap((list) => list ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => ({ id: r.id, mediaType: r.media_type as "movie" | "tv" }));
  const badges = await getChartBadges(shown).catch(() => new Map());

  return (
    <div className="space-y-8">
      <ChartShelf
        title="Top 10 su Netflix in Italia"
        items={netflixChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Prime Video"
        items={primeChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Disney+"
        items={disneyChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Apple TV+"
        items={appleChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="In salita questa settimana"
        items={rising}
        byType={byType}
        showRank={false}
      />
      <Shelf
        title="Di tendenza questa settimana"
        items={trending?.results}
        byType={byType}
        badges={badges}
      />
      <Shelf
        title="Al cinema adesso"
        items={nowPlaying?.results}
        seeAllHref="/cinema"
        byType={byType}
        badges={badges}
      />
      <Shelf
        title="Nuovi su streaming"
        items={newOnStreaming}
        byType={byType}
        badges={badges}
      />
      <Shelf
        title="Serie del momento"
        items={tvPopular?.results}
        byType={byType}
        badges={badges}
      />
      <Shelf
        title="Film più popolari"
        items={moviePopular?.results}
        byType={byType}
        badges={badges}
      />
      <ChartShelf
        title="I film meglio votati su Zapp"
        items={topMovies}
        byType={byType}
        showRank={false}
      />
      <ChartShelf
        title="Le serie meglio votate su Zapp"
        items={topTv}
        byType={byType}
        showRank={false}
      />
      <Shelf title="In arrivo" items={comingSoon} byType={byType} badges={badges} />

      <HomeTypeSwap
        movie={<GenreChips genres={movieGenres?.genres ?? []} type="movie" />}
        tv={<GenreChips genres={tvGenres?.genres ?? []} type="tv" />}
      />
    </div>
  );
}
