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

      <div className="mt-6 space-y-8">
        {title.media_type === "tv" && (
          <Suspense fallback={null}>
            <SeriesProgress cached={cached} />
          </Suspense>
        )}

        {/* "Dove guardarlo" sopra la trama: è il motivo per cui si apre la scheda */}
        <Suspense fallback={<WhereToWatchSkeleton />}>
          <WhereToWatch title={title} providers={providers} />
        </Suspense>

        <TitleRating voteAverage={title.vote_average} voteCount={title.vote_count} />

        {title.overview && <Overview text={title.overview} />}

        {raw?.credits && <CastRow cast={raw.credits.cast} />}

        {title.media_type === "tv" && raw?.seasons && (
          <SeasonList tvId={title.id} seasons={raw.seasons} />
        )}

        <TrailerButton videos={raw?.videos} />

        <RecommendationsShelf recommendations={raw?.recommendations} />

        <TitleReviews />
      </div>

      <Suspense fallback={null}>
        <TitleActions cached={cached} />
      </Suspense>
    </main>
  );
}
