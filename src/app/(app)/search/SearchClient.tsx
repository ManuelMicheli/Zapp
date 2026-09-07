"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchItem } from "@/lib/tmdb/mappers";
import { PosterCard } from "@/components/ui/PosterCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Attesa minima fra un tasto e la richiesta: abbastanza breve da sembrare
 * istantanea, abbastanza lunga da non sparare una fetch per ogni lettera di una
 * parola digitata di getto (la precedente viene comunque annullata).
 */
const DEBOUNCE_MS = 60;

const RESULT_GRID_COLS =
  "grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10";

/** Confronto senza accenti/maiuscole per l'anteprima per prefisso. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Ricerca istantanea: ogni tasto interroga `/api/search` (una chiamata TMDB + una
 * query provider), la richiesta precedente viene annullata, le risposte finiscono in
 * una cache per query (sessione della pagina). Mentre si aspetta la rete la griglia
 * non si svuota mai: restano i risultati precedenti, e se una query più corta era già
 * in cache si mostra subito il suo sottoinsieme che contiene il testo nuovo.
 */
export function SearchClient({ discover }: { discover?: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  /** Vero mentre i risultati mostrati non corrispondono ancora alla query digitata. */
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, SearchItem[]>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setSearched(false);
      setPending(false);
      return;
    }

    const cache = cacheRef.current;
    const key = fold(q);
    const hit = cache.get(key);
    if (hit) {
      abortRef.current?.abort();
      setResults(hit);
      setSearched(true);
      setPending(false);
      return;
    }

    // anteprima: il prefisso più lungo già in cache, filtrato sul testo nuovo
    for (let len = key.length - 1; len >= 2; len--) {
      const prev = cache.get(key.slice(0, len));
      if (!prev) continue;
      const preview = prev.filter((r) => fold(r.title).includes(key));
      if (preview.length > 0) setResults(preview);
      break;
    }
    setPending(true);

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
        cache.set(key, data.results);
        if (controller.signal.aborted) return;
        setResults(data.results);
        setSearched(true);
        setPending(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearched(true);
        setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q]);

  const showSkeleton = pending && results.length === 0;
  const countLabel = useMemo(
    () => `${results.length} ${results.length === 1 ? "risultato" : "risultati"}`,
    [results.length],
  );

  return (
    <div>
      {/* sticky da top 0: copre la fascia della TopNav fissa (safe-area + 72px) e parte sotto di essa.
          Sotto lg il campo lascia a destra il posto della campanella fissa (pr-16). */}
      <div className="sticky top-0 z-10 -mx-5 bg-bg pb-4 pl-5 pr-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+12px)] lg:-mx-10 lg:pl-10 lg:pr-10">
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
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Film, serie TV…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {pending && (
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-accent"
              />
            )}
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

      {showSkeleton && (
        <div className={`grid gap-4 ${RESULT_GRID_COLS}`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}

      {!pending && searched && results.length === 0 && (
        <EmptyState title="Nessun risultato" description="Prova con un altro titolo." />
      )}

      {results.length > 0 && (
        <div
          className={`transition-opacity duration-150 ${pending ? "opacity-70" : "opacity-100"}`}
        >
          <p className="mb-3.5 text-[13px] text-muted">{countLabel}</p>
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
        </div>
      )}

      {/* Discover quando l'input è vuoto */}
      {q.length < 2 && discover && <div className="-mx-5 lg:-mx-10">{discover}</div>}
    </div>
  );
}
