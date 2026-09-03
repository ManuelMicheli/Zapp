import { Suspense } from "react";
import type { CachedTitle } from "@/lib/tmdb/cache";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { BackButton } from "@/components/layout/BackButton";
import { TitleHeader } from "./TitleHeader";
import { WhereToWatch } from "./WhereToWatch";
import { TitleRating } from "./TitleRating";
import { Overview } from "./Overview";
import { CastRow } from "./CastRow";
import { SeasonList } from "./SeasonList";
import { TrailerButton } from "./TrailerButton";
import { RecommendationsShelf } from "./RecommendationsShelf";
import { TitleActions } from "./TitleActions";
import { TitleReviews } from "./TitleReviews";
import { SeriesProgress } from "./SeriesProgress";
import { FriendsWatching } from "./FriendsWatching";

function WhereToWatchSkeleton() {
  return (
    <div className="space-y-2 px-4">
      <Skeleton className="h-5 w-36 rounded" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

export function TitleBody({ cached }: { cached: CachedTitle }) {
  const { title, providers } = cached;
  const raw = title.raw as unknown as (TmdbMovieDetails & TmdbTvDetails) | null;

  return (
    <main className="relative pb-40">
      <BackButton />
      <TitleHeader title={title} />

      {/* mobile: colonna unica; desktop: due colonne su tutta la larghezza */}
      <div className="mt-6 lg:px-6">
        <div className="space-y-8 lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start lg:gap-12 lg:space-y-0">
          <div className="space-y-8 lg:sticky lg:top-6">
            {title.media_type === "tv" && (
              <Suspense fallback={null}>
                <SeriesProgress cached={cached} />
              </Suspense>
            )}

            {/* "Dove guardarlo" in cima: è il motivo per cui si apre la scheda */}
            <Suspense fallback={<WhereToWatchSkeleton />}>
              <WhereToWatch title={title} providers={providers} />
            </Suspense>

            <Suspense fallback={null}>
              <FriendsWatching titleId={title.id} mediaType={title.media_type} />
            </Suspense>

            <TitleRating voteAverage={title.vote_average} voteCount={title.vote_count} />

            <TrailerButton videos={raw?.videos} />
          </div>

          <div className="space-y-8">
            {title.overview && <Overview text={title.overview} />}

            {raw?.credits && <CastRow cast={raw.credits.cast} />}

            {title.media_type === "tv" && raw?.seasons && (
              <SeasonList tvId={title.id} seasons={raw.seasons} />
            )}

            <RecommendationsShelf recommendations={raw?.recommendations} />
          </div>
        </div>

        <div className="mt-10 lg:mx-auto lg:max-w-5xl">
          <Suspense fallback={null}>
            <TitleReviews cached={cached} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <TitleActions cached={cached} />
      </Suspense>
    </main>
  );
}
