"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchItem } from "@/lib/tmdb/mappers";
import { PosterCard } from "@/components/ui/PosterCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const DEBOUNCE_MS = 300;

const RESULT_GRID_COLS =
  "grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10";

export function SearchClient({ discover }: { discover?: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { results: SearchItem[] };
        setResults(data.results);
        setSearched(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      {/* sticky da top 0: copre la fascia della TopNav fissa (safe-area + 72px) e parte sotto di essa */}
      <div className="sticky top-0 z-10 -mx-5 bg-bg px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+84px)] lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-3 lg:max-w-[640px]">
          <div className="relative flex h-[52px] flex-1 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.08] px-[18px] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/[0.16]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Film, serie TV…"
              autoComplete="off"
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Cancella ricerca"
                className="ml-auto flex size-[22px] shrink-0 items-center justify-center rounded-full bg-white/[0.18]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="text-bg"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.blur();
              }}
              className="shrink-0 text-base font-medium"
            >
              Annulla
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className={`grid gap-4 ${RESULT_GRID_COLS}`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState title="Nessun risultato" description="Prova con un altro titolo." />
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="mb-3.5 text-[13px] text-muted">
            {results.length} {results.length === 1 ? "risultato" : "risultati"}
          </p>
          <div className={`grid gap-4 ${RESULT_GRID_COLS}`}>
            {results.map((item) => (
              <PosterCard
                key={`${item.mediaType}-${item.id}`}
                title={item.title}
                posterPath={item.posterPath}
                year={item.year}
                providers={item.providers}
                href={`/title/${item.mediaType}/${item.id}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Discover quando l'input è vuoto */}
      {query.trim().length < 2 && discover && (
        <div className="-mx-5 lg:-mx-10">{discover}</div>
      )}
    </div>
  );
}
