"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { posterUrl } from "@/lib/config";
import type { SeedCandidate } from "@/lib/taste/seed";
import type { SearchItem } from "@/lib/tmdb/mappers";

const DEBOUNCE_MS = 180;
const MAX_RESULTS = 6;

/** `"1994"` → `1994`; la ricerca dà l'anno come stringa, e a volte non lo dà. */
function annoDi(anno: string | null): number | null {
  if (!anno) return null;
  const n = Number(anno);
  return Number.isInteger(n) ? n : null;
}

/**
 * La barra di ricerca del passo 2: chi ha già in testa i propri film preferiti non
 * deve sperare di trovarli nella griglia.
 *
 * Un risultato scelto **entra nella griglia in testa**, già selezionato: il contatore
 * resta uno solo e la scelta si vede: senza, uno cerca un titolo, lo tocca e non
 * succede niente di visibile.
 */
export function SeedSearch({
  selected,
  pieno,
  onPick,
}: {
  selected: string[];
  pieno: boolean;
  onPick: (candidato: SeedCandidate) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setCercato(false);
      setCercando(false);
      return;
    }
    setCercando(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const risposta = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
        const dati = (await risposta.json()) as { results: SearchItem[] };
        if (controller.signal.aborted) return;
        setResults(dati.results.filter((r) => r.posterPath).slice(0, MAX_RESULTS));
        setErrore(null);
        setCercato(true);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErrore("Ricerca non riuscita. Riprova.");
      } finally {
        if (!abortRef.current?.signal.aborted) setCercando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const scegli = (item: SearchItem) => {
    if (!item.posterPath) return;
    onPick({
      id: item.id,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
      genreIds: [],
      fonte: "cercato",
      rank: null,
      score: item.voteAverage,
      year: annoDi(item.year),
    });
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[46px] items-center gap-2 rounded-full border border-white/10 bg-surface-2 pl-4 pr-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/[0.16]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px] shrink-0 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <label htmlFor="seed-search" className="sr-only">
          Cerca i tuoi film preferiti
        </label>
        {/* `type="text"`, non `search`: il pulsantino "×" di WebKit dentro un form
        cambia posto a ogni piattaforma, e qui lo stiamo già dando noi. Invio
        **non** invia: questo campo vive dentro il form dell'onboarding, e un
        invio da qui completerebbe l'iscrizione a metà scelta. */}
        <input
          id="seed-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Cerca i tuoi preferiti…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
        />
        {cercando && (
          <span
            aria-label="Ricerca in corso"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-accent"
          />
        )}
        {query.length > 0 && !cercando && (
          <button
            type="button"
            aria-label="Cancella ricerca"
            onClick={() => setQuery("")}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted transition hover:bg-white/[0.08] hover:text-text"
          >
            ×
          </button>
        )}
      </div>

      {errore && (
        <p role="alert" className="px-1 text-xs text-danger">
          {errore}
        </p>
      )}
      {!errore && cercato && results.length === 0 && (
        <p className="px-1 text-xs text-muted-2">Nessun titolo trovato.</p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-surface">
          {results.map((item) => {
            const chiave = `${item.mediaType}-${item.id}`;
            const scelto = selected.includes(chiave);
            const src = posterUrl(item.posterPath, "w342");
            return (
              <li key={chiave}>
                <button
                  type="button"
                  onClick={() => scegli(item)}
                  disabled={scelto || pieno}
                  aria-label={`Scegli ${item.title}`}
                  className="flex w-full min-w-0 items-center gap-3 p-2.5 text-left transition hover:bg-white/[0.04] disabled:opacity-45"
                >
                  <div className="relative h-[54px] w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
                    {src && (
                      <Image
                        src={src}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-text">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.mediaType === "movie" ? "Film" : "Serie TV"}
                      {item.year ? ` · ${item.year}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 pr-1 text-[12px] font-semibold text-accent">
                    {scelto ? "✓" : pieno ? "" : "Aggiungi"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
