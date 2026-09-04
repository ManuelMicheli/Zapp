"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Avatar } from "@/components/social/Avatar";
import { Button } from "@/components/ui/Button";
import { posterUrl } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { fetchFeedPage } from "@/lib/social/actions";
import type { FeedItem } from "@/lib/social/queries";

/** Testo della riga feed con nome utente e titolo in grassetto, voto in accent. */
function feedText(item: FeedItem): ReactNode {
  const name = item.user.display_name ?? item.user.username;
  const Name = <b className="font-semibold text-white">{name}</b>;
  const Title = <b className="font-semibold text-white">{item.titleName}</b>;

  switch (item.kind) {
    case "started":
      if (item.mediaType === "tv" && (item.episodeCount ?? 0) > 1) {
        return (
          <>
            {Name} ha visto {item.episodeCount} episodi di {Title}
            {item.season != null && `, è a S${item.season}E${item.episode}`}
          </>
        );
      }
      if (item.season != null) {
        return (
          <>
            {Name} sta guardando {Title} (S{item.season}E{item.episode})
          </>
        );
      }
      return (
        <>
          {Name} ha iniziato {Title}
        </>
      );
    case "finished":
      if (item.finishedAndRated && item.rating != null) {
        return (
          <>
            {Name} ha finito {Title} e gli ha dato{" "}
            <span className="font-semibold text-accent-soft">{item.rating}</span>
          </>
        );
      }
      return (
        <>
          {Name} ha finito {Title}
        </>
      );
    case "rated":
      return (
        <>
          {Name} ha dato{" "}
          <span className="font-semibold text-accent-soft">{item.rating}</span> a {Title}
        </>
      );
    case "reviewed":
      return (
        <>
          {Name} ha recensito {Title}
        </>
      );
    case "recommended":
      return (
        <>
          {Name} ti ha consigliato {Title}
        </>
      );
    default:
      return (
        <>
          {Name} · {Title}
        </>
      );
  }
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
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/title/${item.mediaType}/${item.titleId}`}
          className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5 hover:bg-surface-2"
        >
          <Avatar
            url={item.user.avatar_url}
            name={item.user.display_name ?? item.user.username}
            size={38}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-[1.4] text-white/[0.78]">{feedText(item)}</p>
            <p className="mt-0.5 text-[11px] text-muted">{timeAgo(item.createdAt)}</p>
          </div>
          <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
            {item.posterPath && (
              <Image
                src={posterUrl(item.posterPath, "w92")!}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </div>
        </Link>
      ))}

      {cursor && (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const page = await fetchFeedPage(cursor);
              setItems((prev) => [...prev, ...page.items]);
              setCursor(page.nextCursor);
            })
          }
          className="w-full"
        >
          {pending ? "Caricamento…" : "Carica altri"}
        </Button>
      )}
    </div>
  );
}
