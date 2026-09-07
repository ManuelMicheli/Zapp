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
import {
  PosterCard,
  SHELF_CARD_CLASS,
  SHELF_CARD_SIZES,
} from "@/components/ui/PosterCard";
import {
  HomeTypeGate,
  HomeTypeSwap,
  type HomeTab,
  type HomeType,
} from "@/components/home/HomeType";
import { HorizontalShelf } from "./HorizontalShelf";
import type { Surface } from "@/lib/taste/surfaces";

const SHELF_SIZE = 20;

type ChartBadges = Map<string, { rank: number; providerName: string; rising: boolean }>;

function ShelfItems({
  items,
  badges,
  preview,
}: {
  items: TmdbMultiResult[];
  badges?: ChartBadges;
  preview?: boolean;
}) {
  return (
    <>
      {items
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .filter((r) => r.poster_path)
        .slice(0, SHELF_SIZE)
        .map((item, i) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            className={SHELF_CARD_CLASS}
            sizes={SHELF_CARD_SIZES}
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
            chartBadge={badges?.get(`${item.media_type}-${item.id}`) ?? null}
            preview={preview}
            signal={{ surface: "discover", position: i }}
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
  preview,
}: ShelfProps & { type?: HomeTab; preview?: boolean }) {
  const mine =
    type && type !== "all"
      ? (items ?? []).filter((r) => r.media_type === type)
      : (items ?? []);
  if (mine.length === 0) return null;
  const shelf = (
    <HorizontalShelf title={title} seeAllHref={seeAllHref}>
      <ShelfItems items={mine} badges={badges} preview={preview} />
    </HorizontalShelf>
  );
  return type ? <HomeTypeGate type={type}>{shelf}</HomeTypeGate> : shelf;
}

function Shelf({ byType, ...props }: ShelfProps) {
  if (!byType) return <OneShelf {...props} />;
  return (
    <>
      {/* "Tutto" tiene lo scaffale intero, com'è su Scopri */}
      <OneShelf {...props} type="all" preview />
      <OneShelf {...props} type="movie" preview />
      <OneShelf {...props} type="tv" preview />
    </>
  );
}

/**
 * Scaffale di classifica: parla di `ChartItem` (voto Zapp, posizione, provider),
 * mai di `TmdbMultiResult` che ha una forma diversa — non vanno mescolati.
 *
 * Una classifica di piattaforma sono in realtà **due** classifiche, una per i film e
 * una per le serie, numerate da 1 a 10 ciascuna: sotto "Tutto" restano perciò due file
 * distinte, con la loro intestazione e la loro numerazione, mai una lista sola
 * rinumerata che nessuna fonte ha mai pubblicato. Dove le posizioni non si mostrano
 * (in salita, meglio votati) mescolare non toglie niente e la fila resta una.
 */
function ChartShelf({
  title,
  titleMovie,
  titleTv,
  items,
  byType,
  showRank,
}: {
  title: string;
  /** Intestazioni delle due file sotto "Tutto"; senza, resta `title`. */
  titleMovie?: string;
  titleTv?: string;
  items: ChartItem[];
  byType: boolean;
  /** La pillola con la posizione: solo per gli scaffali che sono davvero una classifica. */
  showRank: boolean;
}) {
  if (items.length === 0) return null;

  const shelfFor = (list: ChartItem[], heading: string, tabs: HomeTab[] | null) => {
    if (list.length === 0) return null;
    const shelf = (
      <HorizontalShelf title={heading}>
        {list.slice(0, SHELF_SIZE).map((i, indice) => (
          <PosterCard
            key={`${i.mediaType}-${i.id}`}
            className={SHELF_CARD_CLASS}
            sizes={SHELF_CARD_SIZES}
            title={i.title}
            posterPath={i.posterPath}
            year={i.year}
            rating={i.score}
            href={`/title/${i.mediaType}/${i.id}`}
            preview={byType}
            signal={{ surface: chartSurface(i), position: indice }}
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
    return tabs ? <HomeTypeGate type={tabs}>{shelf}</HomeTypeGate> : shelf;
  };

  if (!byType) return shelfFor(items, title, null);

  const only = (type: HomeType) => items.filter((i) => i.mediaType === type);
  if (!showRank) {
    return (
      <>
        {shelfFor(items, title, ["all"])}
        {shelfFor(only("movie"), title, ["movie"])}
        {shelfFor(only("tv"), title, ["tv"])}
      </>
    );
  }
  return (
    <>
      {shelfFor(only("movie"), titleMovie ?? title, ["movie", "all"])}
      {shelfFor(only("tv"), titleTv ?? title, ["tv", "all"])}
    </>
  );
}

function GenreChips({
  genres,
  type,
}: {
  genres: { id: number; name: string }[];
  type: "movie" | "tv";
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
 * Con `byType` (home) ogni scaffale è reso in tre varianti — film, serie e intero
 * per "Tutto": si vede solo quella della scheda scelta in testata, senza tornare
 * al server. `byType` è anche il segnale "siamo in home", quindi lì le copertine si
 * dichiarano al `PreviewLayer` (anteprima col trailer al passaggio del mouse).
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
      {/* La Top 10 ufficiale di Netflix non sta qui: in home è il componente
          grafico `TopTen`, con le cifre accanto alle copertine */}
      <ChartShelf
        title="I più visti su Prime Video"
        titleMovie="I film più visti su Prime Video"
        titleTv="Le serie più viste su Prime Video"
        items={primeChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Disney+"
        titleMovie="I film più visti su Disney+"
        titleTv="Le serie più viste su Disney+"
        items={disneyChart}
        byType={byType}
        showRank
      />
      <ChartShelf
        title="I più visti su Apple TV+"
        titleMovie="I film più visti su Apple TV+"
        titleTv="Le serie più viste su Apple TV+"
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
      {/* In home le tendenze della settimana sono la Top 10 (`TopTen`): qui
          resterebbero le stesse copertine due volte */}
      {!byType && (
        <Shelf
          title="Di tendenza questa settimana"
          items={trending?.results}
          badges={badges}
        />
      )}
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

      {/* In home i generi stanno in testa (`HomeGenres`), non in fondo: qui
          restano solo per Scopri */}
      {!byType && (
        <HomeTypeSwap
          movie={<GenreChips genres={movieGenres?.genres ?? []} type="movie" />}
          tv={<GenreChips genres={tvGenres?.genres ?? []} type="tv" />}
        />
      )}
    </div>
  );
}

/**
 * La superficie di una copertina di classifica: Netflix è il Top 10 ufficiale, gli
 * altri provider sono stime, "in salita" è un'altra cosa ancora. Distinguerle serve
 * al motore di ranking, che deve poter pesare diversamente un titolo ignorato in una
 * classifica ufficiale da uno ignorato in una stima.
 */
function chartSurface(item: ChartItem): Surface {
  if ((item.momentum ?? 0) >= 2 && item.rank > 10) return "home-salita";
  return item.official ? "home-top10" : "home-provider";
}
