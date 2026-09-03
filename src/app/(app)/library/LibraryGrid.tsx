"use client";

import { useState, useTransition } from "react";
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

export interface LibraryItem {
  titleId: number;
  mediaType: Enums<"media_type">;
  status: Enums<"watch_status">;
  rating: number | null;
  name: string;
  posterPath: string | null;
  year: string | null;
}

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<LibraryItem | null>(null);

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

  return (
    <>
      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {items.map((item) => (
          <div key={`${item.mediaType}-${item.titleId}`} className="relative">
            <PosterCard
              title={item.rating != null ? `★ ${item.rating} · ${item.name}` : item.name}
              posterPath={item.posterPath}
              year={item.year}
              href={`/title/${item.mediaType}/${item.titleId}`}
            />
            <button
              type="button"
              aria-label={`Azioni per ${item.name}`}
              onClick={() => setSelected(item)}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name}
      >
        {selected && (
          <div className="space-y-1">
            {selected.status !== "want" && (
              <Item
                label="Voglio vederlo"
                onClick={() =>
                  run(selected, () => addWant(selected.titleId, selected.mediaType), "Spostato in Da vedere")
                }
              />
            )}
            {selected.status !== "watching" && (
              <Item
                label="Sto guardando"
                onClick={() =>
                  run(selected, () => startWatching(selected.titleId, selected.mediaType), "Spostato in Sto guardando")
                }
              />
            )}
            {selected.status !== "watched" && (
              <Item
                label="Visto"
                onClick={() =>
                  run(selected, () => markWatched(selected.titleId, selected.mediaType), "Segnato come visto")
                }
              />
            )}
            {selected.status !== "dropped" && (
              <Item
                label="Abbandona"
                onClick={() =>
                  run(selected, () => dropTitle(selected.titleId, selected.mediaType), "Abbandonato")
                }
              />
            )}
            <Item
              label="Rimuovi dalla libreria"
              danger
              onClick={() =>
                run(selected, () => removeEntry(selected.titleId, selected.mediaType), "Rimosso")
              }
            />
          </div>
        )}
      </Sheet>
    </>
  );
}

function Item({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2 ${
        danger ? "text-danger" : ""
      }`}
    >
      {label}
    </button>
  );
}
