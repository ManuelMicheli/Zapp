import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import type { TmdbSeasonSummary } from "@/lib/tmdb/types";

export function SeasonList({
  tvId,
  seasons,
}: {
  tvId: number;
  seasons: TmdbSeasonSummary[];
}) {
  const visible = seasons.filter((s) => s.season_number > 0);
  if (visible.length === 0) return null;

  return (
    <section className="px-4">
      <h2 className="mb-2 text-base font-bold">Stagioni</h2>
      <div className="space-y-2">
        {visible.map((season) => {
          const poster = posterUrl(season.poster_path, "w185");
          const year = season.air_date?.slice(0, 4);
          return (
            <Link
              key={season.id}
              href={`/title/tv/${tvId}/season/${season.season_number}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:bg-surface-2"
            >
              <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {poster && (
                  <Image src={poster} alt="" fill sizes="48px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{season.name}</p>
                <p className="text-xs text-muted">
                  {season.episode_count} episodi{year ? ` · ${year}` : ""}
                </p>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="shrink-0 text-muted"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
