import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CachedTitle } from "@/lib/tmdb/cache";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/types";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { Skeleton } from "@/components/ui/Skeleton";
import { NearbyShowtimes } from "@/components/cinema/NearbyShowtimes";
import { getPosterPalette } from "@/lib/colors/palette";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { BAND_END_CLASS, TitleHeader } from "./TitleHeader";
import { WhereToWatch } from "./WhereToWatch";
import { TitleRating } from "./TitleRating";
import { Overview } from "./Overview";
import { CastRow } from "./CastRow";
import { SeasonList } from "./SeasonList";
import { RecommendationsShelf } from "./RecommendationsShelf";
import { TitleActions } from "./TitleActions";
import { TitleReviews } from "./TitleReviews";
import { SeriesProgress } from "./SeriesProgress";
import { FriendsWatching } from "./FriendsWatching";

function WhereToWatchSkeleton() {
  return (
    <div className="space-y-2 px-5 md:px-0">
      <Skeleton className="h-6 w-40 rounded" />
      <Skeleton className="h-[68px] w-full rounded-[20px]" />
      <Skeleton className="h-[68px] w-full rounded-[20px]" />
    </div>
  );
}

/** Entry dell'utente sul titolo: letta una volta e passata alle sezioni. */
async function readViewerEntry(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<EntrySnapshot | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("watch_entries")
    .select(
      "status, rating, season_number, episode_number, is_private, started_at, finished_at",
    )
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  return data ?? null;
}

export async function TitleBody({ cached }: { cached: CachedTitle }) {
  const { title, providers } = cached;
  const raw = title.raw as unknown as (TmdbMovieDetails & TmdbTvDetails) | null;
  // palette della locandina → sfondo "ambient" di tutta la scheda
  const [entry, palette] = await Promise.all([
    readViewerEntry(title.id, title.media_type),
    getPosterPalette(title.poster_path),
  ]);

  return (
    <main className="relative isolate pb-36 lg:pb-16">
      <AmbientBackdrop
        palette={palette}
        className={`${BAND_END_CLASS} lg:[--band-end:800px]`}
      />
      <TitleHeader title={title} />

      {/* mobile: colonna unica; da tablet in su: due colonne su tutta la larghezza */}
      <div className="mt-4 md:mt-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-7 md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-12">
          <div className="flex flex-col gap-6 md:sticky md:top-6">
            {/* barra azioni: fissa su mobile, riga in pagina su desktop */}
            <Suspense fallback={null}>
              <TitleActions cached={cached} entry={entry} />
            </Suspense>

            {title.media_type === "tv" && <SeriesProgress title={title} entry={entry} />}

            {/* "Dove guardarlo" in cima: è il motivo per cui si apre la scheda */}
            <Suspense fallback={<WhereToWatchSkeleton />}>
              <WhereToWatch title={title} providers={providers} />
            </Suspense>

            {title.media_type === "movie" && (
              <Suspense fallback={<WhereToWatchSkeleton />}>
                <NearbyShowtimes title={title} />
              </Suspense>
            )}

            <Suspense fallback={null}>
              <FriendsWatching titleId={title.id} mediaType={title.media_type} />
            </Suspense>

            <TitleRating voteAverage={title.vote_average} voteCount={title.vote_count} />
          </div>

          <div className="flex flex-col gap-8">
            {title.overview && <Overview text={title.overview} />}

            {raw?.credits && <CastRow cast={raw.credits.cast} />}

            {title.media_type === "tv" && raw?.seasons && (
              <SeasonList
                tvId={title.id}
                seasons={raw.seasons}
                watchedSeason={entry?.season_number ?? null}
                watchedEpisode={entry?.episode_number ?? null}
                completed={entry?.status === "watched"}
              />
            )}

            <RecommendationsShelf recommendations={raw?.recommendations} />
          </div>
        </div>

        <div className="mt-8 lg:mt-12">
          <Suspense fallback={null}>
            <TitleReviews cached={cached} entry={entry} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
