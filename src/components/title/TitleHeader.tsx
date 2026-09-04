import Image from "next/image";
import { backdropUrl, posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
import type { Tables } from "@/types/database";
import { ShareButton } from "./ShareButton";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Sfumatura del mockup: backdrop leggibile in alto, nero pieno in basso. */
const FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.92) 80%, #000000 100%)";

export function TitleHeader({ title }: { title: Tables<"titles"> }) {
  // original: il backdrop copre tutta la larghezza desktop, niente upscaling
  const backdrop = backdropUrl(title.backdrop_path, "original");
  const poster = posterUrl(title.poster_path, "w500");
  const year = title.release_date?.slice(0, 4);
  const genres = (title.genres as { id: number; name: string }[] | null) ?? [];

  // meta separati da virgola: "2023, 4 stagioni, 30 episodi"
  const meta: string[] = [];
  if (year) meta.push(year);
  if (title.media_type === "movie" && title.runtime) {
    meta.push(formatRuntime(title.runtime));
  }
  if (title.media_type === "tv" && title.number_of_seasons) {
    meta.push(
      `${title.number_of_seasons} stagion${title.number_of_seasons === 1 ? "e" : "i"}`,
    );
    if (title.number_of_episodes) meta.push(`${title.number_of_episodes} episodi`);
  }

  return (
    <header className="relative h-[476px] w-full lg:h-[640px]">
      <div className="absolute inset-x-0 top-0 h-[440px] overflow-hidden lg:h-[520px]">
        {backdrop ? (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            quality={95}
            sizes="(min-width: 1024px) calc(100vw - 240px), 100vw"
            className="origin-[50%_20%] scale-110 object-cover"
          />
        ) : (
          <div className="h-full w-full bg-surface" />
        )}
        <div className="absolute inset-0" style={{ background: FADE }} />
      </div>

      <BackButton />
      <ShareButton title={title.title} />

      <div className="absolute inset-x-5 bottom-4 flex items-end gap-4 md:inset-x-8 lg:inset-x-10 lg:gap-6">
        <div className="relative h-[165px] w-[110px] shrink-0 overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)] lg:h-[252px] lg:w-[168px]">
          {poster && (
            <Image
              src={poster}
              alt={title.title}
              fill
              quality={90}
              sizes="(min-width: 1024px) 168px, 110px"
              className="object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 pb-1">
          <h1 className="line-clamp-3 text-[38px] font-extrabold leading-[1.05] tracking-[-0.05em] lg:text-[56px]">
            {title.title}
          </h1>
          {meta.length > 0 && (
            <p className="text-[13px] text-white/70">{meta.join(", ")}</p>
          )}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.slice(0, 4).map((g) => (
                <span
                  key={g.id}
                  className="glass flex h-7 items-center rounded-full px-[11px] text-xs font-medium"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
