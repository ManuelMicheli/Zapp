import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/social/Avatar";
import { posterUrl } from "@/lib/config";
import type { FriendWatchingItem } from "@/lib/social/queries";
import { SHELF_CARD_CLASS, SHELF_CARD_SIZES } from "@/components/ui/PosterCard";

/**
 * Copertine di quello che gli amici hanno in corso, con la foto di chi lo guarda
 * appoggiata in basso sull'immagine: la stessa misura degli altri scaffali, ma una
 * forma sua — qui il titolo conta meno di chi lo sta guardando.
 */
export function FriendsWatchingRow({ items }: { items: FriendWatchingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
      {items.map((item) => {
        const href = `/title/${item.mediaType}/${item.titleId}`;
        const who = item.friend.displayName ?? item.friend.username;
        const src = posterUrl(item.posterPath, "w342");
        return (
          <Link key={href} href={href} data-preview={href} className={SHELF_CARD_CLASS}>
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
          </Link>
        );
      })}
    </div>
  );
}
