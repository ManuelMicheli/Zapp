"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchItem } from "@/lib/tmdb/mappers";
import { PosterCard } from "@/components/ui/PosterCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const DEBOUNCE_MS = 300;

export function SearchClient({ discover }: { discover?: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-3 pt-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Film, serie TV…"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-xl" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState
          title="Nessun risultato"
          description="Prova con un altro titolo."
        />
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
      )}

      {/* Discover quando l'input è vuoto */}
      {query.trim().length < 2 && discover && (
        <div className="-mx-4">{discover}</div>
      )}
    </div>
  );
}
