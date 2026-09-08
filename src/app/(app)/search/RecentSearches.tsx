"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import type { RecentSearch } from "@/lib/search/queries";
import { clearSearchHistory, rememberSearchedTitle } from "@/lib/search/actions";

/**
 * I titoli aperti dalla ricerca, sotto la barra e solo mentre il campo e' a
 * fuoco (scelta utente 2026-09-08: "compaiono al tocco della barra, chiusa la
 * ricerca si tolgono"). Elenco compatto, non uno scaffale di copertine: qui
 * sotto la barra si legge come un suggerimento, non come una sezione.
 */
export function RecentSearches({ items }: { items: RecentSearch[] }) {
  const [cleared, setCleared] = useState(false);
  const [, startTransition] = useTransition();

  if (cleared || items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-muted">Ricerche recenti</h2>
        <button
          type="button"
          // il mouse non deve togliere il fuoco al campo: il pannello sparirebbe
          // sotto il puntatore prima del click
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setCleared(true);
            startTransition(async () => {
              await clearSearchHistory();
            });
          }}
          className="text-[13px] text-accent-soft"
        >
          Cancella
        </button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-surface">
        {items.map((item) => {
          const src = posterUrl(item.posterPath, "w92");
          return (
            <li key={`${item.mediaType}-${item.id}`}>
              <Link
                href={`/title/${item.mediaType}/${item.id}`}
                onMouseDown={(e) => e.preventDefault()}
                // riaprendolo torna in cima all'elenco, come su ogni storico
                onClick={() => {
                  void rememberSearchedTitle(
                    item.id,
                    item.mediaType,
                    item.title,
                    item.posterPath,
                    item.year,
                  );
                }}
                className="flex items-center gap-3 px-3 py-2.5 active:bg-surface-2"
              >
                <div className="relative h-[54px] w-9 shrink-0 overflow-hidden rounded-[8px] bg-surface-2">
                  {src && (
                    <Image src={src} alt="" fill sizes="36px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{item.title}</p>
                  <p className="text-[13px] text-muted">
                    {[item.year, item.mediaType === "tv" ? "Serie TV" : "Film"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted-2"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
