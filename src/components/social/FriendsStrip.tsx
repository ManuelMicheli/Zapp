import Link from "next/link";
import { Avatar } from "@/components/social/Avatar";
import type { MiniProfile } from "@/lib/social/queries";

/**
 * Amici della sezione "I tuoi amici": fila orizzontale scorrevole di avatar
 * sotto `lg`, elenco verticale nella colonna laterale da `lg` (a quella
 * larghezza la fila lasciava mezza colonna vuota).
 */
export function FriendsStrip({ friends }: { friends: MiniProfile[] }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto scrollbar-none lg:flex-col lg:gap-0.5 lg:overflow-visible">
      {friends.map((f) => (
        <Link
          key={f.id}
          href={`/u/${f.username}`}
          className="flex w-[60px] shrink-0 flex-col items-center gap-1.5 lg:w-full lg:flex-row lg:gap-3 lg:rounded-2xl lg:px-2 lg:py-1.5 lg:hover:bg-surface-2"
        >
          <Avatar
            url={f.avatar_url}
            name={f.display_name ?? f.username}
            size={56}
            sizeClass="size-14 lg:size-11"
          />
          <span className="max-w-full truncate text-xs text-white/80 lg:text-[15px] lg:font-semibold lg:text-white">
            {f.display_name ?? f.username}
          </span>
        </Link>
      ))}
    </div>
  );
}
