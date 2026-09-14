"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { addTitleToList } from "@/lib/lists/actions";
import { posterUrl } from "@/lib/config";
import type { TitleListItem } from "@/lib/lists/queries";
import type { SearchItem } from "@/lib/tmdb/mappers";

const DEBOUNCE_MS = 80;
const MAX_RESULTS = 8;
const titleKey = (type: "movie" | "tv", id: number) => `${type}:${id}`;

export function ListTitleSearch({
  listId,
  existingItems,
}: {
  listId: string;
  existingItems: TitleListItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const q = query.trim();
  const existingKeys = useMemo(
    () => new Set(existingItems.map((item) => titleKey(item.mediaType, item.titleId))),
    [existingItems],
  );

  // Quando il server riconosce un'aggiunta, lo stato locale gli lascia il comando:
  // una rimozione successiva rende di nuovo aggiungibile lo stesso titolo.
  useEffect(() => {
    setAddedKeys((current) => {
      const next = new Set([...current].filter((key) => !existingKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [existingKeys, addedKeys]);

  useEffect(() => {
    if (q.length < 2) {
      abortRef.current?.abort();
      setSearching(false);
      return;
    }
    let controller: AbortController | null = null;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { results: SearchItem[] };
        if (controller.signal.aborted) return;
        setResults(data.results.slice(0, MAX_RESULTS));
        setSearched(true);
        setSearching(false);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        setSearchError("La ricerca non è riuscita. Riprova.");
        setSearched(true);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  }, [q]);

  function changeQuery(value: string) {
    if (value.trim() === q) {
      setQuery(value);
      return;
    }
    abortRef.current?.abort();
    setQuery(value);
    setResults([]);
    setSearched(false);
    setSearchError(null);
    setAddErrors({});
    setSearching(value.trim().length >= 2);
  }

  async function add(item: SearchItem) {
    const key = titleKey(item.mediaType, item.id);
    setPendingKeys((current) => new Set(current).add(key));
    setAddErrors((current) => ({ ...current, [key]: "" }));
    try {
      const result = await addTitleToList(listId, item.id, item.mediaType);
      if (!result.ok) {
        setAddErrors((current) => ({
          ...current,
          [key]: result.error ?? "Non è riuscito, riprova.",
        }));
        return;
      }
      setAddedKeys((current) => new Set(current).add(key));
    } catch {
      setAddErrors((current) => ({ ...current, [key]: "Non è riuscito, riprova." }));
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="list-title-search-heading" className="max-w-3xl">
      <h2
        id="list-title-search-heading"
        className="text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[30px]"
      >
        Aggiungi un titolo
      </h2>
      <div className="relative mt-5 flex h-[52px] items-center rounded-full border border-white/10 bg-surface-2 pl-[18px] pr-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/[0.16]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <label htmlFor="list-title-search" className="sr-only">
          Cerca film e serie
        </label>
        <input
          id="list-title-search"
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Cerca un film o una serie…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <span
            aria-label="Ricerca in corso"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-accent"
          />
        )}
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Cancella ricerca"
            onClick={() => changeQuery("")}
            className="ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-muted transition hover:bg-white/[0.08] hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            ×
          </button>
        )}
      </div>
      {searchError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {searchError}
        </p>
      )}
      {!searchError && searched && results.length === 0 && (
        <p className="mt-3 text-sm text-muted">Nessun titolo trovato.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-surface">
          {results.map((item) => {
            const key = titleKey(item.mediaType, item.id);
            const pending = pendingKeys.has(key);
            const present = existingKeys.has(key) || addedKeys.has(key);
            const src = item.posterPath ? posterUrl(item.posterPath, "w342") : null;
            return (
              <li key={key} className="flex min-w-0 items-center gap-3 p-3">
                <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {src ? (
                    <Image src={src} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted">
                      {item.title}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {item.mediaType === "movie" ? "Film" : "Serie TV"}
                    {item.year ? ` · ${item.year}` : ""}
                  </p>
                  {addErrors[key] && (
                    <p role="alert" className="mt-1 text-xs leading-4 text-danger">
                      {addErrors[key]}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending || present}
                  onClick={() => void add(item)}
                  aria-label={`Aggiungi ${item.title}`}
                  className="glass-accent h-11 shrink-0 rounded-full px-4 text-xs font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-accent-light disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
                >
                  {pending ? "Aggiungo…" : present ? "Già nella lista" : "Aggiungi"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
