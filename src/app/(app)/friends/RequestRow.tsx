"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/Avatar";
import { acceptFriendRequest, declineFriendRequest } from "@/lib/social/actions";
import type { MiniProfile } from "@/lib/social/queries";

export function RequestRow({ profile }: { profile: MiniProfile }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  if (done === "declined") return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
      <Link href={`/u/${profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {profile.display_name ?? profile.username}
          </p>
          <p className="truncate text-xs text-muted">@{profile.username}</p>
        </div>
      </Link>
      {done === "accepted" ? (
        <span className="text-xs font-semibold text-accent">Amici ✓</span>
      ) : (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await acceptFriendRequest(profile.id);
                if (r.ok) setDone("accepted");
              })
            }
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Accetta
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await declineFriendRequest(profile.id);
                if (r.ok) setDone("declined");
              })
            }
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Rifiuta
          </button>
        </div>
      )}
    </div>
  );
}
