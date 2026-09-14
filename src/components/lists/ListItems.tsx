"use client";

import { removeTitleFromList } from "@/lib/lists/actions";
import { PosterCard } from "@/components/ui/PosterCard";
import { useOptimisticValue, withoutKey } from "@/lib/ui/optimistic";
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
  const { value: visible, pending, run } = useOptimisticValue(items);

  function remove(item: TitleListItem) {
    run(
      withoutKey(visible, (entry) => entry.id, item.id),
      () => removeTitleFromList(listId, item.id),
    );
  }

  if (visible.length === 0)
    return (
      <p className="max-w-xl text-sm leading-6 text-muted">
        {canEdit
          ? "Questa lista è ancora vuota. Scegli un titolo dai suggerimenti qui sotto."
          : "Questa lista è ancora vuota. Puoi consultarla, ma solo chi la modifica può aggiungere titoli."}
      </p>
    );

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 min-[390px]:grid-cols-3 sm:grid-cols-4 lg:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] lg:gap-x-5 lg:gap-y-8">
      {visible.map((item) => (
        <div key={item.id} className="relative">
          <PosterCard
            title={item.name}
            posterPath={item.posterPath}
            year={item.year == null ? undefined : String(item.year)}
            href={`/title/${item.mediaType}/${item.titleId}`}
            sizes="(max-width: 389px) 50vw, (max-width: 639px) 33vw, (max-width: 1023px) 25vw, 180px"
          />
          {canEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(item)}
              className="glass absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-lg text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
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
