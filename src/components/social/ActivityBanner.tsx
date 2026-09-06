import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/social/Avatar";
import { backdropUrl, posterUrl } from "@/lib/config";

/**
 * Banner di un'attività social: immagine larga della serie/film e, in basso,
 * l'amico con la sua foto profilo e cosa ha fatto. `action` è lo slot in basso
 * a destra (cuore del feed, icona del tipo nelle notifiche): sta fuori dal
 * `Link`, così resta cliccabile da solo.
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
  highlight?: boolean;
}) {
  const image = backdropPath
    ? backdropUrl(backdropPath, "w1280")
    : posterUrl(posterPath, "w500");

  return (
    <article
      className={`relative overflow-hidden rounded-[24px] border bg-surface ${
        highlight ? "border-accent/30" : "border-border"
      }`}
    >
      <Link href={href} className="block">
        <div className="relative aspect-[16/9] w-full bg-surface-2">
          {image && (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 767px) 100vw, 45vw"
              className={`object-cover ${backdropPath ? "" : "object-[center_18%]"}`}
            />
          )}
          {/* velo in basso: il testo resta leggibile su qualunque fotogramma */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black via-black/72 to-transparent"
          />
          {time && (
            <span className="glass absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white/85">
              {time}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-3.5 pb-3.5 pr-16">
            <span className="shrink-0 rounded-full ring-1 ring-white/25">
              <Avatar url={avatarUrl} name={avatarName} size={40} />
            </span>
            <p className="line-clamp-2 text-[13px] font-semibold leading-[1.3] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {text}
            </p>
          </div>
        </div>
      </Link>
      {action && <div className="absolute bottom-3 right-3">{action}</div>}
    </article>
  );
}
