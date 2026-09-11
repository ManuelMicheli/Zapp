import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import type { SagaMovie } from "@/lib/sagas/order";

export function SagaMovieCard({
  movie,
  index,
  watched,
  note,
}: {
  movie: SagaMovie;
  index: number;
  watched: boolean;
  note?: string;
}) {
  const poster = posterUrl(movie.posterPath, "w342");
  return (
    <li>
      <Link
        href={`/title/movie/${movie.id}`}
        className="group -mx-2 flex items-start gap-3 rounded-[14px] p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:mx-0 md:block md:p-0"
      >
        <div className="relative aspect-[2/3] w-[84px] shrink-0 overflow-hidden rounded-[10px] bg-surface-2 md:w-full md:rounded-[14px]">
          {poster ? (
            <Image
              src={poster}
              alt={movie.title}
              fill
              sizes="(max-width: 767px) 84px, 200px"
              className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
              {movie.title}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 md:mt-2">
          <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
            <span
              className="text-xs font-semibold tabular-nums text-muted"
              aria-label={`Posizione ${index + 1}`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {watched && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-soft">
                ✓ Visto
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold leading-snug text-text md:line-clamp-2">
            {movie.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{movie.releaseDate.slice(0, 4)}</p>
          {note && <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>}
        </div>
      </Link>
    </li>
  );
}
