"use client";

import Image from "next/image";
import { useState, useTransition, type ReactNode } from "react";
import { posterUrl } from "@/lib/config";
import { PosterCard } from "@/components/ui/PosterCard";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import {
  addWant,
  dropTitle,
  markWatched,
  removeEntry,
  restoreEntry,
  startWatching,
  type ActionResult,
} from "@/lib/watch/actions";
import type { Enums } from "@/types/database";
import type { LibraryItem } from "@/lib/watch/queries";
import { loadMoreLibrary } from "./actions";
import { LIBRARY_PAGE_SIZE } from "./limits";

const MEDIA_TYPE_LABEL: Record<Enums<"media_type">, string> = {
  movie: "Film",
  tv: "Serie",
};

export function LibraryGrid({
  initialItems,
  total,
  status,
  mediaType,
  statusLabel,
}: {
  initialItems: LibraryItem[];
  /** Entry totali per questo stato/tipo: oltre la prima pagina compare "Carica altri". */
  total: number;
  status: Enums<"watch_status">;
  mediaType: "movie" | "tv" | null;
  /** Etichetta dello stato corrente (da TABS), uguale per tutti gli item mostrati. */
  statusLabel: string;
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [items, setItems] = useState(initialItems);
  const [loadingMore, startLoadMore] = useTransition();
  const hasMore = items.length < total;

  function loadMore() {
    startLoadMore(async () => {
      const next = await loadMoreLibrary(status, mediaType, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => `${i.mediaType}-${i.titleId}`));
        return [...prev, ...next.filter((i) => !seen.has(`${i.mediaType}-${i.titleId}`))];
      });
    });
  }

  function run(item: LibraryItem, action: () => Promise<ActionResult>, message: string) {
    setSelected(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      show(message, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(item.titleId, item.mediaType, result.prev);
          });
        },
      });
    });
  }

  const subtitle = selected
    ? `${MEDIA_TYPE_LABEL[selected.mediaType]}${selected.year ? `, ${selected.year}` : ""}. In ${statusLabel}${
        selected.rating != null ? ` con ★ ${selected.rating}` : ""
      }`
    : "";

  return (
    <>
      <div className="grid grid-cols-3 gap-4 px-5 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 lg:px-10">
        {items.map((item) => (
          <div key={`${item.mediaType}-${item.titleId}`} className="relative">
            <PosterCard
              title={item.name}
              posterPath={item.posterPath}
              year={item.year}
              rating={item.rating}
              href={`/title/${item.mediaType}/${item.titleId}`}
            />
            <button
              type="button"
              aria-label={`Azioni per ${item.name}`}
              onClick={() => setSelected(item)}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full border border-white/[0.12] bg-black/55 backdrop-blur-md"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="#ffffff"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center px-5 lg:px-10">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="glass h-11 rounded-full px-6 text-[15px] font-semibold disabled:opacity-60"
          >
            {loadingMore
              ? "Carico…"
              : `Carica altri ${Math.min(LIBRARY_PAGE_SIZE, total - items.length)}`}
          </button>
        </div>
      )}

      <Sheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="flex items-center gap-3.5 px-1">
              <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
                {posterUrl(selected.posterPath, "w185") && (
                  <Image
                    src={posterUrl(selected.posterPath, "w185")!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex flex-col gap-[3px]">
                <p className="text-lg font-bold tracking-[-0.02em]">{selected.name}</p>
                <p className="text-[13px] text-muted">{subtitle}</p>
              </div>
            </div>

            <div className="mt-4 space-y-0.5 rounded-[20px] border border-border bg-surface p-1">
              {selected.status !== "want" && (
                <Item
                  icon={<path d="M12 5v14M5 12h14" />}
                  label="Voglio vederlo"
                  onClick={() =>
                    run(
                      selected,
                      () => addWant(selected.titleId, selected.mediaType),
                      "Spostato in Da vedere",
                    )
                  }
                />
              )}
              {selected.status !== "watching" && (
                <Item
                  icon={
                    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
                  }
                  label="Sto guardando"
                  onClick={() =>
                    run(
                      selected,
                      () => startWatching(selected.titleId, selected.mediaType),
                      "Spostato in Sto guardando",
                    )
                  }
                />
              )}
              {selected.status !== "watched" && (
                <Item
                  icon={<path d="M5 12l4 4L19 6" />}
                  label="Visto"
                  onClick={() =>
                    run(
                      selected,
                      () => markWatched(selected.titleId, selected.mediaType),
                      "Segnato come visto",
                    )
                  }
                />
              )}
              {selected.status !== "dropped" && (
                <Item
                  icon={<path d="M6 6l12 12M18 6 6 18" />}
                  label="Abbandona"
                  onClick={() =>
                    run(
                      selected,
                      () => dropTitle(selected.titleId, selected.mediaType),
                      "Abbandonato",
                    )
                  }
                />
              )}
            </div>

            <div className="mt-2 space-y-0.5 rounded-[20px] border border-border bg-surface p-1">
              <Item
                icon={
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
                }
                label="Rimuovi dalla libreria"
                danger
                onClick={() =>
                  run(
                    selected,
                    () => removeEntry(selected.titleId, selected.mediaType),
                    "Rimosso",
                  )
                }
              />
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

function Item({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[54px] w-full items-center gap-3.5 rounded-[14px] px-4 text-base font-medium transition-colors hover:bg-surface-2 ${
        danger ? "text-danger" : "text-text"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={danger ? "text-danger" : "text-accent-pale"}
      >
        {icon}
      </svg>
      <span>{label}</span>
    </button>
  );
}
