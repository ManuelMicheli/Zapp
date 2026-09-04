import Image from "next/image";
import { backdropUrl, posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Tables } from "@/types/database";
import { CinematicBackdrop } from "./CinematicBackdrop";
import { ShareButton } from "./ShareButton";
import { rankTrailers } from "./trailer";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Velo sul fondale: appena accennato in alto (solo per leggere i bottoni in vetro),
 * immagine/trailer nudi per quasi due terzi del riquadro, nero pieno soltanto
 * nell'ultimo quinto dove poggiano titolo e locandina.
 */
export const HEADER_FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.42) 80%, rgba(0,0,0,0.88) 93%, #000000 100%)";

/**
 * Velo sulla banda 16:9 mobile: solo un accenno in alto per i bottoni in vetro; il
 * resto del trailer resta nudo (titolo e locandina stanno sotto la banda, non sopra).
 */
export const BAND_FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 100%)";

export function TitleHeader({ title }: { title: Tables<"titles"> }) {
  // original: il backdrop copre tutta la larghezza desktop, niente upscaling
  const backdrop = backdropUrl(title.backdrop_path, "original");
  const poster = posterUrl(title.poster_path, "w500");
  const year = title.release_date?.slice(0, 4);
  const genres = (title.genres as { id: number; name: string }[] | null) ?? [];
  const trailers = rankTrailers((title.raw as { videos?: TmdbVideos } | null)?.videos);

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
    // sotto lg: banda 16:9 intera sotto la TopNav (72px + safe area), poi locandina e
    // titolo; da lg: fondale alto con locandina e titolo appoggiati in basso
    <header className="relative w-full pt-[calc(env(safe-area-inset-top,0px)+72px)] lg:h-[880px] lg:pt-0">
      <div className="relative aspect-video w-full overflow-hidden lg:absolute lg:inset-x-0 lg:top-0 lg:aspect-auto lg:h-[800px]">
        <CinematicBackdrop
          image={backdrop}
          trailerKeys={trailers.map((v) => v.key)}
          label={`Trailer di ${title.title}`}
        />
        <div
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{ background: BAND_FADE }}
        />
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{ background: HEADER_FADE }}
        />
      </div>

      <BackButton />
      <ShareButton title={title.title} />

      <div className="relative mt-4 flex items-end gap-4 px-5 md:px-8 lg:absolute lg:inset-x-10 lg:bottom-4 lg:mt-0 lg:gap-6 lg:px-0">
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
