"use client";

import { useState, useTransition } from "react";
import { removeTitleFromList } from "@/lib/lists/actions";
import { PosterCard } from "@/components/ui/PosterCard";
import type { TitleListItem } from "@/lib/lists/queries";

export function ListItems({
  listId,
  items,
  canEdit,
}: {
  listId: string;
  items: TitleListItem[];
  canEdit: boolean;
}) {
  const [visible, setVisible] = useState(items);
  const [pending, startTransition] = useTransition();
  function remove(item: TitleListItem) {
    startTransition(async () => {
      const result = await removeTitleFromList(listId, item.id);
      if (result.ok)
        setVisible((current) => current.filter((entry) => entry.id !== item.id));
    });
  }
  if (visible.length === 0)
    return <p className="text-sm text-muted">Aggiungi film e serie dalla loro pagina.</p>;
  return (
    <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {visible.map((item) => (
        <div key={item.id} className="relative">
          <PosterCard
            title={item.name}
            posterPath={item.posterPath}
            year={item.year == null ? undefined : String(item.year)}
            href={`/title/${item.mediaType}/${item.titleId}`}
          />
          {canEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(item)}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-lg text-white disabled:opacity-50"
              aria-label={`Rimuovi ${item.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
