import Image from "next/image";
import { backdropUrl, posterUrl } from "@/lib/config";
import type { Tables } from "@/types/database";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TitleHeader({ title }: { title: Tables<"titles"> }) {
  const backdrop = backdropUrl(title.backdrop_path, "w1280");
  const poster = posterUrl(title.poster_path, "w342");
  const year = title.release_date?.slice(0, 4);
  const genres = (title.genres as { id: number; name: string }[] | null) ?? [];

  const meta: string[] = [];
  if (year) meta.push(year);
  if (title.media_type === "movie" && title.runtime) {
    meta.push(formatRuntime(title.runtime));
  }
  if (title.media_type === "tv" && title.number_of_seasons) {
    meta.push(
      `${title.number_of_seasons} stagion${title.number_of_seasons === 1 ? "e" : "i"}` +
        (title.number_of_episodes ? ` · ${title.number_of_episodes} episodi` : ""),
    );
  }

  return (
    <div className="relative">
      <div className="relative h-52 w-full overflow-hidden md:h-72 lg:h-96">
        {backdrop ? (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="480px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      </div>

      <div className="relative -mt-20 flex items-end gap-4 px-4 lg:mx-auto lg:max-w-4xl lg:-mt-28">
        <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-surface shadow-lg lg:w-40">
          {poster && (
            <Image src={poster} alt={title.title} fill sizes="112px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 pb-1">
          <h1 className="text-xl font-bold leading-tight lg:text-3xl">{title.title}</h1>
          {meta.length > 0 && (
            <p className="mt-1 text-sm text-muted">{meta.join(" · ")}</p>
          )}
        </div>
      </div>

      {genres.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 px-4 lg:mx-auto lg:max-w-4xl">
          {genres.map((g) => (
            <span
              key={g.id}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
            >
              {g.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
