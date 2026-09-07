import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";

export interface TopRatedItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  rating: number;
}

/** Righe di `watch_entries` col titolo incorporato, come le legge il profilo. */
interface RatedRow {
  rating: number | null;
  title: {
    id: number;
    media_type: string;
    title: string;
    poster_path: string | null;
  } | null;
}

/** Converte le righe della query nei dati dello scaffale. */
export function toTopRated(rows: RatedRow[] | null): TopRatedItem[] {
  return (rows ?? [])
    .filter((r) => r.title != null && r.rating != null)
    .map((r) => ({
      id: r.title!.id,
      mediaType: r.title!.media_type === "tv" ? ("tv" as const) : ("movie" as const),
      title: r.title!.title,
      posterPath: r.title!.poster_path,
      rating: r.rating!,
    }));
}

/** Scaffale "voti più alti": locandine grandi col voto in evidenza. */
export function TopRatedShelf({
  heading,
  items,
  seeAllHref,
  className = "",
}: {
  heading: string;
  items: TopRatedItem[];
  seeAllHref?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className={`flex flex-col gap-3.5 ${className}`}>
      <div className="flex items-baseline justify-between px-5 md:px-0">
        <h2 className="text-xl font-bold tracking-[-0.03em]">{heading}</h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-[13px] font-medium text-accent-soft">
            Vedi tutti
          </Link>
        )}
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:px-0">
        {items.map((item) => {
          const src = posterUrl(item.posterPath, "w342");
          return (
            <Link
              key={`${item.mediaType}-${item.id}`}
              href={`/title/${item.mediaType}/${item.id}`}
              className="relative h-[225px] w-[150px] shrink-0 overflow-hidden rounded-[18px] bg-surface-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
            >
              {src ? (
                <Image src={src} alt="" fill sizes="150px" className="object-cover" />
              ) : null}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[110px] bg-gradient-to-t from-black/85 to-transparent"
              />
              <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                <span className="text-[13px] font-semibold leading-tight">
                  {item.title}
                </span>
                <span className="shrink-0 text-[30px] font-extrabold leading-none tracking-[-0.05em] text-accent-pale">
                  {item.rating}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
