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
    <div className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5">
      <Link
        href={`/u/${profile.username}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar
          url={profile.avatar_url}
          name={profile.display_name ?? profile.username}
          size={42}
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-white">
            {profile.display_name ?? profile.username}
          </p>
          <p className="truncate text-xs text-muted">@{profile.username}</p>
        </div>
      </Link>
      {done === "accepted" ? (
        <span className="shrink-0 text-xs font-semibold text-accent-soft">Amici ✓</span>
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
            className="h-11 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Accetta
          </button>
          <button
            type="button"
            aria-label="Rifiuta"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await declineFriendRequest(profile.id);
                if (r.ok) setDone("declined");
              })
            }
            className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] disabled:opacity-50"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
