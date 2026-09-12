"use client";

import { useState, useTransition } from "react";
import { addTitleToList } from "@/lib/lists/actions";
import type { TitleListSummary } from "@/lib/lists/queries";
import { Sheet } from "@/components/ui/Sheet";

export function AddToListSheet({
  titleId,
  mediaType,
  lists,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
  lists: TitleListSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function add(listId: string) {
    startTransition(async () => {
      const result = await addTitleToList(listId, titleId, mediaType);
      setMessage(
        result.ok ? "Aggiunto alla lista." : (result.error ?? "Non è riuscito, riprova."),
      );
    });
  }

  return (
    <>
      <button
        type="button"
        className="block w-full rounded-2xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2"
        onClick={() => setOpen(true)}
      >
        Aggiungi a una lista
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Aggiungi a una lista">
        {lists.length === 0 ? (
          <p className="text-sm text-muted">Crea prima una lista dalla Libreria.</p>
        ) : (
          <div className="space-y-1">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                disabled={pending || list.role === "viewer"}
                onClick={() => add(list.id)}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                <span>{list.name}</span>
                <span className="text-xs text-muted">
                  {list.role === "viewer" ? "Sola lettura" : `${list.itemCount} titoli`}
                </span>
              </button>
            ))}
          </div>
        )}
        {message && <p className="mt-4 text-sm text-muted">{message}</p>}
      </Sheet>
    </>
  );
}
