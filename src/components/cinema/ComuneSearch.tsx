"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_FIELD_CLASS } from "@/components/auth/field";
import { Icon } from "./icons";

export interface ComuneHit {
  name: string;
  sigla: string;
  /** "Ossona, MI" */
  label: string;
}

/** Attesa dopo l'ultimo tasto prima di chiedere i suggerimenti (l'elenco è locale). */
const DEBOUNCE_MS = 80;

/**
 * Campo "dove sei" con l'elenco dei comuni sotto: si scrive "ossona" e si tocca
 * "Ossona, MI". Niente ricerca a testo libero da indovinare — il posto lo sceglie
 * l'utente, e con lui arrivano coordinate e provincia esatte (`/api/comuni`).
 */
export function ComuneSearch({
  onPick,
  disabled = false,
  autoFocus = false,
}: {
  onPick: (c: ComuneHit) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ComuneHit[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`/api/comuni?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results: ComuneHit[] };
        setHits(data.results ?? []);
        setActive(0);
      } catch {
        /* richiesta annullata: arriva quella dopo */
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, picked]);

  function pick(c: ComuneHit) {
    setPicked(true);
    setQuery(c.label);
    setHits([]);
    onPick(c);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setPicked(false);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (hits.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setHits([]);
          }
        }}
        placeholder="Scrivi il tuo comune"
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className={`${AUTH_FIELD_CLASS} w-full`}
      />

      {hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-[14px] border border-border bg-sheet py-1 shadow-2xl">
          {hits.map((c, i) => (
            <li key={`${c.name}-${c.sigla}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] ${
                  i === active ? "bg-surface-2" : ""
                }`}
              >
                <Icon name="pin" size={14} />
                <span className="truncate font-medium">{c.name}</span>
                <span className="ml-auto shrink-0 text-[13px] text-muted">{c.sigla}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
