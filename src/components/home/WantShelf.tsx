"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  PosterCard,
  SHELF_CARD_CLASS,
  SHELF_CARD_SIZES,
} from "@/components/ui/PosterCard";
import type { ByTab, PlatformShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { Scored } from "@/lib/ratings/types";
import { useHomeType } from "./HomeType";

const PILL =
  "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors";
const PILL_OFF =
  "border-white/[0.08] bg-white/[0.04] text-white/75 hover:border-white/25";
const PILL_ON = "border-white/25 bg-white/[0.14] text-white";

type Tab = "list" | number;

export interface WantShelfPlatform extends Omit<PlatformShelf, "movie" | "tv"> {
  items: ByTab<Scored<ShelfItem>[]>;
}

/**
 * "Da vedere" con le pillole delle piattaforme: la prima è la tua lista, le altre
 * sono le novità di Netflix, Prime Video, Disney+, Apple TV+ e NOW. Un solo
 * scaffale invece di due sezioni; le liste arrivano già pronte dal server, quindi
 * cambiare pillola (o scheda Film/Serie TV) non torna indietro a chiedere nulla.
 */
export function WantShelf({
  list,
  platforms,
}: {
  list: ByTab<Scored<ShelfItem>[]>;
  platforms: WantShelfPlatform[];
}) {
  const type = useHomeType()?.type ?? "all";
  const mine = list[type];
  const hasList = mine.length > 0;
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab: Tab = chosen ?? (hasList ? "list" : (platforms[0]?.id ?? "list"));

  const platform = platforms.find((p) => p.id === tab);
  const items = platform ? platform.items[type] : mine;
  if (items.length === 0 && !hasList && platforms.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between px-5 lg:px-10">
        <h2 className="text-xl font-bold tracking-[-0.03em]">
          {platform ? `Novità su ${platform.name}` : "Da vedere"}
        </h2>
        {!platform && hasList && (
          <Link
            href="/library?status=want"
            className="text-[13px] font-medium text-accent-soft"
          >
            Vedi tutti
          </Link>
        )}
      </div>

      <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto px-5 pb-1 lg:px-10">
        {hasList && (
          <button
            type="button"
            onClick={() => setChosen("list")}
            aria-pressed={tab === "list"}
            className={`${PILL} ${tab === "list" ? PILL_ON : PILL_OFF}`}
          >
            La tua lista
          </button>
        )}
        {platforms.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setChosen(p.id)}
            aria-pressed={tab === p.id}
            className={`${PILL} ${tab === p.id ? PILL_ON : PILL_OFF}`}
          >
            {p.logo && (
              <Image
                src={p.logo}
                alt=""
                width={18}
                height={18}
                className="size-[18px] rounded-[5px]"
              />
            )}
            {p.name}
          </button>
        ))}
      </div>

      {items.length > 0 ? (
        <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
          {items.map((item, i) => (
            <PosterCard
              key={`${item.mediaType}-${item.id}`}
              className={SHELF_CARD_CLASS}
              sizes={SHELF_CARD_SIZES}
              title={item.title}
              posterPath={item.posterPath}
              year={item.year}
              rating={item.zappScore ?? item.rating ?? undefined}
              votes={item.zappVotes}
              href={`/title/${item.mediaType}/${item.id}`}
              preview
              signal={{ surface: "home-libreria", position: i }}
            />
          ))}
        </div>
      ) : (
        <p className="px-5 text-[13px] text-muted lg:px-10">
          {platform
            ? `Nessuna novità su ${platform.name} per questo tipo.`
            : "La tua lista è vuota: aggiungi un titolo con «Voglio vederlo»."}
        </p>
      )}
    </section>
  );
}
