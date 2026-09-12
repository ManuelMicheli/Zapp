"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import { addWant } from "@/lib/watch/actions";
import { dismissRecommendation, markRecommendationSeen } from "@/lib/social/actions";
import type { LibraryRecommendation } from "@/lib/social/queries";

export function RecommendedSection({
  initialItems,
}: {
  initialItems: LibraryRecommendation[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function accept(item: LibraryRecommendation) {
    setPendingId(item.id);
    startTransition(async () => {
      const result = await addWant(item.titleId, item.mediaType);
      if (result.ok) {
        await markRecommendationSeen(item.id);
        remove(item.id);
      }
      setPendingId(null);
    });
  }

  function dismiss(item: LibraryRecommendation) {
    setPendingId(item.id);
    startTransition(async () => {
      const result = await dismissRecommendation(item.id);
      if (result.ok) remove(item.id);
      setPendingId(null);
    });
  }

  if (items.length === 0) {
    return (
      <p className="px-5 text-sm text-muted lg:px-10">
        Qui compariranno i titoli che ti consigliano i tuoi amici.
      </p>
    );
  }

  return (
    <div className="grid gap-3 px-5 lg:grid-cols-2 lg:px-10">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-3"
        >
          <Link
            href={`/title/${item.mediaType}/${item.titleId}`}
            className="relative h-[126px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-surface-2"
          >
            {posterUrl(item.posterPath, "w185") && (
              <Image
                src={posterUrl(item.posterPath, "w185")!}
                alt=""
                fill
                sizes="84px"
                className="object-cover"
              />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              {item.from.display_name || `@${item.from.username}`} ti consiglia
            </p>
            <Link
              href={`/title/${item.mediaType}/${item.titleId}`}
              className="mt-1 block truncate text-base font-semibold"
            >
              {item.titleName}
            </Link>
            {item.message && (
              <p className="mt-1 line-clamp-2 text-sm text-muted">“{item.message}”</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => accept(item)}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Voglio vederlo
              </button>
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => dismiss(item)}
                className="rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-muted disabled:opacity-60"
              >
                Ignora
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
