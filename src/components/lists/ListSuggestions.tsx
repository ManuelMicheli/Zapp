"use client";

import { useState } from "react";
import { addTitleToList } from "@/lib/lists/actions";
import {
  POSTER_GRID_DESKTOP,
  POSTER_GRID_SIZES_2COL,
  PosterCard,
} from "@/components/ui/PosterCard";
import type {
  ListSuggestedTitle,
  ListSuggestionsResult,
} from "@/lib/lists/suggestion-types";

type Filter = "all" | "movie" | "tv";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "movie", label: "Film" },
  { id: "tv", label: "Serie" },
];

function suggestionKey(item: ListSuggestedTitle) {
  return `${item.mediaType}:${item.id}`;
}

export function ListSuggestions({
  listId,
  result,
}: {
  listId: string;
  result: ListSuggestionsResult;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const serverKeys = result.items.map(suggestionKey).join("|");
  const [lastServerKeys, setLastServerKeys] = useState(serverKeys);
  if (lastServerKeys !== serverKeys) {
    setLastServerKeys(serverKeys);
    setAdded(new Set());
    setErrors({});
  }
  const visible = result.items.filter(
    (item) => filter === "all" || item.mediaType === filter,
  );

  async function add(item: ListSuggestedTitle) {
    const key = suggestionKey(item);
    setPending((current) => new Set(current).add(key));
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await addTitleToList(listId, item.id, item.mediaType);
      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          [key]: response.error ?? "Non è riuscito, riprova.",
        }));
        return;
      }
      setAdded((current) => new Set(current).add(key));
    } catch {
      setErrors((current) => ({
        ...current,
        [key]: "Non è riuscito, riprova.",
      }));
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  if (result.error) {
    return (
      <p role="alert" className="max-w-xl text-sm leading-6 text-danger">
        {result.error}
      </p>
    );
  }

  return (
    <>
      <div className="mb-5 flex gap-1 rounded-full bg-surface-2 p-1 sm:w-fit">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`h-10 flex-1 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-accent sm:flex-none ${
              filter === option.id ? "bg-white text-black" : "text-muted hover:text-text"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Nessun suggerimento in questa categoria.</p>
      ) : (
        <div
          className={`grid grid-cols-2 gap-x-3 gap-y-7 min-[390px]:grid-cols-3 sm:grid-cols-4 lg:gap-x-5 lg:gap-y-9 ${POSTER_GRID_DESKTOP}`}
        >
          {visible.map((item) => {
            const key = suggestionKey(item);
            const isPending = pending.has(key);
            const isAdded = added.has(key);
            return (
              <div key={key} className="flex h-full min-w-0 flex-col">
                <div className="flex-1">
                  <PosterCard
                    title={item.title}
                    posterPath={item.posterPath}
                    year={item.year}
                    reason={item.reason}
                    href={`/title/${item.mediaType}/${item.id}`}
                    sizes={POSTER_GRID_SIZES_2COL}
                  />
                </div>
                <button
                  type="button"
                  disabled={isPending || isAdded}
                  onClick={() => void add(item)}
                  className="mt-3 h-11 w-full rounded-full bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-pale disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isPending ? "Aggiungo…" : isAdded ? "Aggiunto" : "Aggiungi"}
                </button>
                {errors[key] && (
                  <p role="alert" className="mt-2 text-xs leading-4 text-danger">
                    {errors[key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
