import Image from "next/image";
import Link from "next/link";
import { backdropUrl } from "@/lib/config";
import { getComingSoon } from "@/lib/home/shelves";
import { releaseLabel } from "@/lib/home/shelves-rank";
import { HomeTypeGate } from "./HomeType";

/**
 * "In arrivo": l'unico scaffale della home che parla di domani, quindi non ha la
 * forma delle copertine — card larghe 16:9 col fotogramma del film e la data
 * d'uscita in grande. Solo film (TMDB non ha un "upcoming" per le serie in IT):
 * sotto "Serie TV" la sezione sparisce, come le due del cinema.
 */
export async function ComingSoonRow() {
  const items = await getComingSoon();
  if (items.length === 0) return null;

  return (
    <HomeTypeGate type={["all", "movie"]}>
      <section>
        <h2 className="mb-3 px-5 text-xl font-bold tracking-[-0.03em] lg:px-10">
          In arrivo
        </h2>
        <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
          {items.map((item) => {
            const href = `/title/movie/${item.id}`;
            const when = releaseLabel(item.releaseDate);
            const src = backdropUrl(item.backdropPath, "w780");
            return (
              <Link
                key={item.id}
                href={href}
                data-preview={href}
                className="w-[260px] shrink-0 md:w-[300px] lg:w-[340px] xl:w-[380px]"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-[16px] border border-white/[0.08] bg-surface-2">
                  {src && (
                    <Image
                      src={src}
                      alt={item.title}
                      fill
                      sizes="(max-width: 767px) 260px, (max-width: 1279px) 340px, 380px"
                      className="object-cover"
                    />
                  )}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
                  />
                  {when && (
                    <span className="glass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                      {when}
                    </span>
                  )}
                  <p className="absolute inset-x-3 bottom-3 line-clamp-2 text-[17px] font-bold leading-tight tracking-[-0.02em]">
                    {item.title}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </HomeTypeGate>
  );
}
