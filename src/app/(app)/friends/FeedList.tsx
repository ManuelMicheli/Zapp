"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/Avatar";
import { posterUrl } from "@/lib/config";
import { fetchFeedPage } from "@/lib/social/actions";
import type { FeedItem } from "@/lib/social/queries";

function feedText(item: FeedItem): string {
  const name = item.user.display_name ?? item.user.username;
  switch (item.kind) {
    case "started":
      if (item.mediaType === "tv" && (item.episodeCount ?? 0) > 1) {
        return `${name} ha visto ${item.episodeCount} episodi di ${item.titleName}${
          item.season != null ? `, è a S${item.season}E${item.episode}` : ""
        }`;
      }
      if (item.season != null) {
        return `${name} sta guardando ${item.titleName} (S${item.season}E${item.episode})`;
      }
      return `${name} ha iniziato ${item.titleName}`;
    case "finished":
      if (item.finishedAndRated && item.rating != null) {
        return `${name} ha finito ${item.titleName} e gli ha dato ${item.rating}`;
      }
      return `${name} ha finito ${item.titleName}`;
    case "rated":
      return `${name} ha dato ${item.rating} a ${item.titleName}`;
    case "reviewed":
      return `${name} ha recensito ${item.titleName}`;
    case "recommended":
      return `${name} ti ha consigliato ${item.titleName}`;
    default:
      return `${name} · ${item.titleName}`;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}g`;
}

export function FeedList({
  initialItems,
  initialCursor,
}: {
  initialItems: FeedItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1.5 px-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/title/${item.mediaType}/${item.titleId}`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 hover:bg-surface-2"
        >
          <Avatar
            url={item.user.avatar_url}
            name={item.user.display_name ?? item.user.username}
            size={36}
          />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            {feedText(item)}{" "}
            <span className="text-xs text-muted">· {timeAgo(item.createdAt)}</span>
          </p>
          <div className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {item.posterPath && (
              <Image
                src={posterUrl(item.posterPath, "w92")!}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
              />
            )}
          </div>
        </Link>
      ))}

      {cursor && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const page = await fetchFeedPage(cursor);
              setItems((prev) => [...prev, ...page.items]);
              setCursor(page.nextCursor);
            })
          }
          className="w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold text-muted disabled:opacity-50"
        >
          {pending ? "Caricamento…" : "Carica altri"}
        </button>
      )}
    </div>
  );
}
