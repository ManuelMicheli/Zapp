import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSeason } from "@/lib/tmdb/client";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { EpisodeRow } from "@/components/title/EpisodeRow";
import { BackButton } from "@/components/layout/BackButton";

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

  const [cached, season] = await Promise.all([
    getTitleCached(tvId, "tv", false),
    getSeason(tvId, seasonNumber).catch(() => null),
  ]);
  if (!season) notFound();

  const year = season.air_date?.slice(0, 4);

  return (
    <main className="relative pb-28">
      <header className="relative bg-surface px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <BackButton />
        <div className="pl-10">
          {cached && (
            <Link
              href={`/title/tv/${tvId}`}
              className="text-xs font-medium text-accent"
            >
              {cached.title.title}
            </Link>
          )}
          <h1 className="text-xl font-bold">{season.name}</h1>
          <p className="text-sm text-muted">
            {season.episodes.length} episodi{year ? ` · ${year}` : ""}
          </p>
        </div>
      </header>

      <div className="mt-4 space-y-2 px-4">
        {season.episodes.map((episode) => (
          <EpisodeRow key={episode.id} episode={episode} />
        ))}
      </div>
    </main>
  );
}
