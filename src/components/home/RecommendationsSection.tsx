"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/Avatar";
import { posterUrl } from "@/lib/config";
import { useToast } from "@/components/ui/Toaster";
import { addWant } from "@/lib/watch/actions";
import { markRecommendationSeen } from "@/lib/social/actions";
import type { HomeRecommendation } from "@/lib/social/queries";
import { useHomeType } from "./HomeType";

/** In home segue la scheda Film / Serie TV: mostra solo i consigli di quel tipo. */
export function RecommendationsSection({ items }: { items: HomeRecommendation[] }) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [visible, setVisible] = useState(items);
  const type = useHomeType()?.type;
  const shown = type ? visible.filter((rec) => rec.mediaType === type) : visible;

  if (shown.length === 0) return null;

  return (
    <section className="px-5 lg:px-10">
      <h2 className="mb-3 text-xl font-bold tracking-[-0.03em]">Consigliati da amici</h2>
      <div className="space-y-2.5">
        {shown.map((rec) => {
          const from = rec.from.display_name ?? rec.from.username;
          return (
            <div
              key={rec.id}
              className="flex items-center gap-3 rounded-[20px] border border-border bg-surface p-2.5"
            >
              <Link
                href={`/title/${rec.mediaType}/${rec.titleId}`}
                className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2"
              >
                {rec.posterPath && (
                  <Image
                    src={posterUrl(rec.posterPath, "w92")!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[15px] font-semibold">{rec.titleName}</p>
                <div className="flex items-center gap-1.5">
                  <Avatar url={rec.from.avatar_url} name={from} size={18} />
                  <p className="truncate text-xs text-muted">
                    {from}
                    {rec.message ? `: «${rec.message}»` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="-my-1 min-h-11 shrink-0 rounded-full border border-accent/40 bg-accent/[0.18] px-3.5 text-xs font-semibold text-accent-pale"
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
          );
        })}
      </div>
    </section>
  );
}
