"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { posterUrl } from "@/lib/config";
import { useToast } from "@/components/ui/Toaster";
import { addWant } from "@/lib/watch/actions";
import { markRecommendationSeen } from "@/lib/social/actions";
import type { HomeRecommendation } from "@/lib/social/queries";

export function RecommendationsSection({ items }: { items: HomeRecommendation[] }) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [visible, setVisible] = useState(items);

  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 px-4 text-base font-bold">Consigliati da amici</h2>
      <div className="space-y-1.5 px-4">
        {visible.map((rec) => (
          <div
            key={rec.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
          >
            <Link
              href={`/title/${rec.mediaType}/${rec.titleId}`}
              className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md bg-surface-2"
            >
              {rec.posterPath && (
                <Image
                  src={posterUrl(rec.posterPath, "w92")!}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{rec.titleName}</p>
              <p className="truncate text-xs text-muted">
                da {rec.from.display_name ?? rec.from.username}
                {rec.message ? ` · “${rec.message}”` : ""}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white"
              onClick={() =>
                startTransition(async () => {
                  const result = await addWant(rec.titleId, rec.mediaType);
                  await markRecommendationSeen(rec.id);
                  setVisible((prev) => prev.filter((r) => r.id !== rec.id));
                  show(result.ok ? "Aggiunto a Da vedere" : "Errore");
                })
              }
            >
              Voglio vederlo
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
