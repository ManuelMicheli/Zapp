import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { backdropUrl, posterUrl } from "@/lib/config";
import { getSeason } from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { pickSeasonStill } from "@/lib/tmdb/season-still";
import type { TmdbTvDetails } from "@/lib/tmdb/types";
import { EpisodeRow } from "@/components/title/EpisodeRow";
import { Overview } from "@/components/title/Overview";
import { CinematicBackdrop } from "@/components/title/CinematicBackdrop";
import { HEADER_FADE } from "@/components/title/TitleHeader";
import { findTrailer } from "@/components/title/trailer";
import { BackButton } from "@/components/layout/BackButton";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string; n: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, n } = await params;
  const cached = await getTitleCached(Number(id), "tv", false);
  return {
    title: cached ? `${cached.title.title} – Stagione ${n}` : `Stagione ${n}`,
  };
}

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function SeasonPage({ params }: Props) {
  const { id, n } = await params;
  const tvId = Number(id);
  const seasonNumber = Number(n);
  if (
    !Number.isInteger(tvId) ||
    tvId <= 0 ||
    !Number.isInteger(seasonNumber) ||
    seasonNumber < 0
  ) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [cached, season, { data: entry }] = await Promise.all([
    getTitleCached(tvId, "tv", false),
    getSeason(tvId, seasonNumber).catch(() => null),
    user
      ? supabase
          .from("watch_entries")
          .select("season_number, episode_number")
          .eq("user_id", user.id)
          .eq("title_id", tvId)
          .eq("media_type", "tv")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!season) notFound();

  const year = season.air_date?.slice(0, 4);
  const total = season.episodes.length;
  const runtime = season.episodes.reduce((sum, e) => sum + (e.runtime ?? 0), 0);

  // banner: il fotogramma più definito fra gli episodi di questa stagione (ogni
  // stagione ha il suo sfondo); backdrop della serie solo se nessun episodio ha
  // ancora un fotogramma (stagione non uscita); poster sfocato come ultima spiaggia
  const seasonStill = await pickSeasonStill(tvId, season);
  const seriesBackdrop = backdropUrl(cached?.title.backdrop_path ?? null, "original");
  const poster = posterUrl(
    season.poster_path ?? cached?.title.poster_path ?? null,
    "w342",
  );
  const bannerImage = seasonStill ?? seriesBackdrop ?? poster;
  const bannerBlurred = !seasonStill && !seriesBackdrop;

  // trailer come fondale: quello della stagione se esiste, altrimenti quello della serie
  const seriesRaw = cached?.title.raw as unknown as TmdbTvDetails | null;
  const seasonTrailer = findTrailer(season.videos);
  const trailer = seasonTrailer ?? findTrailer(seriesRaw?.videos);
  const trailerLabel = seasonTrailer ? "Trailer della stagione" : "Trailer della serie";

  // episodi visti in questa stagione: 0 se il progresso è più indietro,
  // tutti se una stagione successiva è già iniziata
  const watchedSeason = entry?.season_number ?? null;
  const watchedEpisode = entry?.episode_number ?? null;
  let done = 0;
  if (watchedSeason != null) {
    if (watchedSeason > seasonNumber) done = total;
    else if (watchedSeason === seasonNumber && watchedEpisode != null) {
      done = season.episodes.filter((e) => e.episode_number <= watchedEpisode).length;
    }
  }
  // "Prossimo": primo non visto subito dopo quelli visti, solo con progresso qui
  const nextIndex = done > 0 && done < total ? done : -1;

  const meta: string[] = [`${total} episod${total === 1 ? "io" : "i"}`];
  if (year) meta.push(year);
  if (runtime > 0) meta.push(formatRuntime(runtime));

  return (
    <main className="relative pb-36 lg:pb-16">
      <header className="relative h-[470px] w-full lg:h-[560px]">
        <div className="absolute inset-x-0 top-0 h-[440px] overflow-hidden lg:h-[460px]">
          <CinematicBackdrop
            image={bannerImage}
            trailerKey={trailer?.key ?? null}
            blurred={bannerBlurred}
            label={trailerLabel}
          />
          <div className="absolute inset-0" style={{ background: HEADER_FADE }} />
        </div>

        <BackButton />

        <div className="absolute inset-x-5 bottom-4 flex items-end gap-4 md:inset-x-8 lg:inset-x-10 lg:gap-6">
          <div className="relative h-[162px] w-[108px] shrink-0 overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)] lg:h-[228px] lg:w-[152px]">
            {poster && (
              <Image
                src={poster}
                alt={season.name}
                fill
                quality={90}
                sizes="(min-width: 1024px) 152px, 108px"
                className="object-cover"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
            {cached && (
              <Link
                href={`/title/tv/${tvId}`}
                className="truncate text-[13px] font-medium text-accent-soft"
              >
                {cached.title.title}
              </Link>
            )}
            <h1 className="line-clamp-2 text-[34px] font-extrabold leading-[1.05] tracking-[-0.05em] lg:text-[52px]">
              {season.name}
            </h1>
            <p className="text-[13px] text-white/70">{meta.join(", ")}</p>

            {total > 0 && (
              <div className="flex items-center gap-2 text-[13px] font-medium text-accent-pale">
                <div className="h-1 w-[90px] overflow-hidden rounded-full bg-white/[0.12]">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((done / total) * 100)}%` }}
                  />
                </div>
                <span>
                  {done} / {total}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-6 px-5 md:mt-6 md:px-8 lg:px-10">
        {season.overview && (
          <div className="max-w-3xl">
            <Overview text={season.overview} className="" />
          </div>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Episodi</h2>
          {total === 0 ? (
            <p className="text-sm text-muted">
              Nessun episodio annunciato per questa stagione.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {season.episodes.map((episode, i) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  titleId={tvId}
                  watchedSeason={watchedSeason}
                  watchedEpisode={watchedEpisode}
                  isNext={i === nextIndex}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
