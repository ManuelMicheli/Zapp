import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/social/Avatar";
import { backdropUrl, posterUrl } from "@/lib/config";

/**
 * Banner di un'attività social: immagine larga della serie/film e, in basso,
 * l'amico con la sua foto profilo e cosa ha fatto. `action` è lo slot in basso
 * a destra (cuore del feed, icona del tipo nelle notifiche): sta fuori dal
 * `Link`, così resta cliccabile da solo. Senza immagine (notifiche di sola
 * amicizia) il riquadro diventa una sfumatura accent con `glyph` in filigrana,
 * per tenere la stessa sagoma in griglia.
 *
 * Da `lg` cresce tutto insieme (avatar, testo, spazi): stesso oggetto, più
 * grande, mai un banner desktop con dentro tipografia da telefono.
 */
export function ActivityBanner({
  href,
  backdropPath,
  posterPath,
  avatarUrl,
  avatarName,
  text,
  time,
  action,
  glyph,
  highlight = false,
}: {
  href: string;
  backdropPath: string | null;
  posterPath: string | null;
  avatarUrl: string | null;
  avatarName: string;
  text: ReactNode;
  time?: string;
  action?: ReactNode;
  glyph?: ReactNode;
  highlight?: boolean;
}) {
  const image = backdropPath
    ? backdropUrl(backdropPath, "w1280")
    : posterUrl(posterPath, "w500");

  return (
    <article
      className={`relative overflow-hidden rounded-[24px] border bg-surface transition-colors lg:rounded-[28px] ${
        highlight ? "border-accent/30" : "border-border"
      }`}
    >
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] w-full bg-surface-2">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1799px) 45vw, 30vw"
              className={`object-cover ${backdropPath ? "" : "object-[center_18%]"}`}
            />
          ) : (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 120% at 80% 0%, rgba(139,92,246,0.34) 0%, rgba(139,92,246,0.10) 45%, rgba(0,0,0,0) 72%)",
                }}
              />
              {glyph && (
                <span
                  aria-hidden="true"
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-white/[0.14] lg:right-9"
                >
                  {glyph}
                </span>
              )}
            </>
          )}
          {/* velo in basso: il testo resta leggibile su qualunque fotogramma */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black via-black/72 to-transparent"
          />
          {time && (
            <span className="glass absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white/85 lg:right-4 lg:top-4 lg:px-3 lg:py-1.5 lg:text-xs">
              {time}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-3.5 pb-3.5 pr-16 lg:gap-4 lg:px-5 lg:pb-5 lg:pr-24">
            <span className="shrink-0 rounded-full ring-1 ring-white/25">
              <Avatar
                url={avatarUrl}
                name={avatarName}
                size={48}
                sizeClass="size-10 lg:size-12"
              />
            </span>
            <p className="line-clamp-2 text-[13px] font-semibold leading-[1.3] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] lg:text-[15px] lg:leading-[1.35]">
              {text}
            </p>
          </div>
        </div>
      </Link>
      {action && (
        <div className="absolute bottom-3 right-3 lg:bottom-4 lg:right-4">{action}</div>
      )}
    </article>
  );
}
