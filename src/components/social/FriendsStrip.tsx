import Link from "next/link";
import { Avatar } from "@/components/social/Avatar";
import type { MiniProfile } from "@/lib/social/queries";

/** Fila orizzontale scorrevole degli avatar amici, sezione "I tuoi amici". */
export function FriendsStrip({ friends }: { friends: MiniProfile[] }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto scrollbar-none">
      {friends.map((f) => (
        <Link
          key={f.id}
          href={`/u/${f.username}`}
          className="flex w-[60px] shrink-0 flex-col items-center gap-1.5"
        >
          <Avatar url={f.avatar_url} name={f.display_name ?? f.username} size={56} />
          <span className="max-w-full truncate text-xs text-white/80">
            {f.display_name ?? f.username}
          </span>
        </Link>
      ))}
    </div>
  );
}
