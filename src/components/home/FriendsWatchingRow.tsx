"use client";

import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/social/Avatar";
import { posterUrl } from "@/lib/config";
import type { FriendWatchingItem } from "@/lib/social/queries";
import { SHELF_CARD_CLASS, SHELF_CARD_SIZES } from "@/components/ui/PosterCard";
import type { FriendLiveSession } from "@/lib/watch/social-live";
import { playbackTime } from "@/lib/watch/progress";
import { PROVIDERS } from "@/lib/config";
import { LiveIndicator } from "./LiveIndicator";
import { usePlaybackPosition } from "./usePlaybackPosition";

/**
 * Copertine di quello che gli amici hanno in corso, con la foto di chi lo guarda
 * appoggiata in basso sull'immagine: la stessa misura degli altri scaffali, ma una
 * forma sua — qui il titolo conta meno di chi lo sta guardando.
 */
export function FriendsWatchingRow({
  items,
  live = [],
}: {
  items: FriendWatchingItem[];
  live?: FriendLiveSession[];
}) {
  if (items.length === 0) return null;
  return (
    <HorizontalScroll className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
      {items.map((item) => {
        const href = `/title/${item.mediaType}/${item.titleId}`;
        const who = item.friend.displayName ?? item.friend.username;
        const src = posterUrl(item.posterPath, "w342");
        const current = live.find(
          (s) =>
            s.userId === item.userId &&
            s.titleId === item.titleId &&
            s.mediaType === item.mediaType,
        );
        return (
          <Link
            key={`${item.userId}:${href}`}
            href={href}
            data-preview={href}
            className={SHELF_CARD_CLASS}
          >
            <div className="group relative aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-surface-2">
              {src && (
                <Image
                  src={src}
                  alt={item.name}
                  fill
                  sizes={SHELF_CARD_SIZES}
                  className="object-cover"
                />
              )}
              {/* velo solo in basso: la foto dell'amico deve staccare dall'immagine */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent"
              />
              {current && <FriendProgress current={current} who={who} />}
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
                <Avatar url={item.friend.avatarUrl} name={who} size={22} />
                <span className="truncate text-[11px] font-semibold text-white/90">
                  {who}
                </span>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-tight">
              {item.name}
            </p>
            {current && (
              <p className="mt-1 text-[11px] text-muted">
                {[
                  current.episodeNumber !== null
                    ? `${current.seasonNumber !== null ? `S${current.seasonNumber} · ` : ""}E${current.episodeNumber}`
                    : null,
                  current.providerId ? PROVIDERS[current.providerId]?.name : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </Link>
        );
      })}
    </HorizontalScroll>
  );
}

/** Aggiornamenti locali: nessun sondaggio aggiuntivo per ogni amico. */
function FriendProgress({ current, who }: { current: FriendLiveSession; who: string }) {
  const position = usePlaybackPosition(current) ?? current.positionMs;
  const ratio =
    current?.durationMs && current.durationMs > 0
      ? Math.min(100, Math.max(0, (position / current.durationMs) * 100))
      : null;
  return (
    <>
      <div className="absolute right-2 top-2">
        <LiveIndicator state={current.state === "playing" ? "playing" : "paused"} />
      </div>
      <div className="absolute inset-x-2 bottom-11 text-white">
        <p className="mb-1.5 text-[10px] font-medium tabular-nums drop-shadow">
          {playbackTime(position)}
          {current.durationMs ? ` / ${playbackTime(current.durationMs)}` : ""}
        </p>
        {ratio !== null && (
          <div
            role="progressbar"
            aria-label={`Avanzamento di ${who}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio)}
            className="h-[3px] overflow-hidden rounded-full bg-white/30"
          >
            <div
              className="h-full rounded-full bg-accent-light"
              style={{ width: `${ratio}%` }}
            />
          </div>
        )}
      </div>
    </>
  );
}

