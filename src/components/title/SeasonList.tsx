import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import type { TmdbSeasonSummary } from "@/lib/tmdb/types";

export function SeasonList({
  tvId,
  seasons,
  watchedSeason,
  watchedEpisode,
  completed = false,
}: {
  tvId: number;
  seasons: TmdbSeasonSummary[];
  /** Ultima stagione raggiunta dall'utente (null se non tracciata). */
  watchedSeason?: number | null;
  /** Ultimo episodio visto nella stagione corrente. */
  watchedEpisode?: number | null;
  /** Serie segnata come vista: tutte le stagioni sono complete. */
  completed?: boolean;
}) {
  const visible = seasons.filter((s) => s.season_number > 0);
  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 px-5 lg:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Stagioni</h2>
      <div className="space-y-2">
        {visible.map((season) => {
          const poster = posterUrl(season.poster_path, "w185");
          const year = season.air_date?.slice(0, 4);

          const current = watchedSeason != null && season.season_number === watchedSeason;
          const seen = current ? (watchedEpisode ?? 0) : 0;
          const done =
            completed ||
            (watchedSeason != null &&
              (season.season_number < watchedSeason ||
                (current && seen >= season.episode_count)));
          const inProgress = !done && current && seen > 0;

          return (
            <Link
              key={season.id}
              href={`/title/tv/${tvId}/season/${season.season_number}`}
              className="flex items-center gap-3 rounded-[20px] border border-border bg-surface py-2.5 pl-2.5 pr-3.5 transition-colors hover:bg-surface-2"
            >
              <div className="relative h-[66px] w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {poster && (
                  <Image src={poster} alt="" fill sizes="44px" className="object-cover" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="truncate text-[15px] font-semibold">{season.name}</p>
                <p className="text-xs text-muted">
                  {season.episode_count} episodi{year ? `, ${year}` : ""}
                </p>
              </div>

              {done ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-accent-pale"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4.5 4.5L19 7" />
                  </svg>
                </span>
              ) : inProgress ? (
                <span className="shrink-0 text-xs font-semibold text-accent-soft">
                  {seen} / {season.episode_count}
                </span>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="shrink-0 text-muted"
                  aria-hidden="true"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
