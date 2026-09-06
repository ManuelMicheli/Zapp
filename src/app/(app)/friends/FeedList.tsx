"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ActivityBanner } from "@/components/social/ActivityBanner";
import { ActivityLikeButton } from "@/components/social/ActivityLikeButton";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/format";
import { fetchFeedPage } from "@/lib/social/actions";
import type { FeedItem } from "@/lib/social/queries";

/** Testo del banner: nome dell'amico e titolo in grassetto, voto in accent. */
function feedText(item: FeedItem): ReactNode {
  const name = item.user.display_name ?? item.user.username;
  const Name = <b className="font-bold">{name}</b>;
  const Title = <b className="font-bold">{item.titleName}</b>;
  const season = item.season != null ? ` · Stagione ${item.season}` : "";

  switch (item.kind) {
    case "started":
      if (item.mediaType === "tv" && (item.episodeCount ?? 0) > 1) {
        return (
          <>
            {Name} ha visto {item.episodeCount} episodi di {Title}
            {season}
          </>
        );
      }
      return (
        <>
          {Name} ha iniziato a guardare {Title}
          {season}
        </>
      );
    case "finished":
      if (item.finishedAndRated && item.rating != null) {
        return (
          <>
            {Name} ha finito di guardare {Title} e gli ha dato{" "}
            <span className="font-bold text-accent-pale">{item.rating}</span>
          </>
        );
      }
      return (
        <>
          {Name} ha finito di guardare {Title}
        </>
      );
    case "rated":
      return (
        <>
          {Name} ha dato <span className="font-bold text-accent-pale">{item.rating}</span>{" "}
          a {Title}
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
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 lg:gap-4 min-[1800px]:grid-cols-3">
        {items.map((item) => (
          <ActivityBanner
            key={item.id}
            href={`/title/${item.mediaType}/${item.titleId}`}
            backdropPath={item.backdropPath}
            posterPath={item.posterPath}
            avatarUrl={item.user.avatar_url}
            avatarName={item.user.display_name ?? item.user.username}
            text={feedText(item)}
            time={timeAgo(item.createdAt)}
            action={
              <ActivityLikeButton
                activityId={item.id}
                count={item.likeCount}
                liked={item.likedByMe}
              />
            }
          />
        ))}
      </div>

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
