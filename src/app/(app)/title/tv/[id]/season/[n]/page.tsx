import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import { getSeason } from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { EpisodeRow } from "@/components/title/EpisodeRow";
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
  const backdrop = posterUrl(season.poster_path, "w500");

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

  return (
    <main className="relative pb-36">
      <header className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden">
          {backdrop && (
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-[1.3] object-cover object-[50%_30%] opacity-60 blur-[24px]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black" />
        </div>

        <div className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+40px)] lg:px-10">
          <BackButton inline />
          <div className="flex min-w-0 flex-col gap-1">
            {cached && (
              <Link
                href={`/title/tv/${tvId}`}
                className="truncate text-[13px] font-medium text-accent-soft"
              >
                {cached.title.title}
              </Link>
            )}
            <h1 className="truncate text-[26px] font-bold leading-none tracking-[-0.04em]">
              {season.name}
            </h1>
          </div>
        </div>

        <div className="relative mt-7 flex items-center justify-between px-5 lg:px-10">
          <p className="text-[13px] text-muted">
            {total} episodi{year ? `, ${year}` : ""}
          </p>
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
      </header>

      <div className="relative mt-4 space-y-2 px-5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 lg:px-10 xl:grid-cols-3">
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
    </main>
  );
}
