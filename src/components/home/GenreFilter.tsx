"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { GenreEntry } from "@/lib/genres/catalog";

const PILL =
  "flex h-9 shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.09] hover:text-white";

/** Quanto sfuma il bordo della fila quando c'è altro da scorrere. */
const FADE = 56;

/**
 * Filtro per genere in testa alla home.
 * Da `lg` è una fila unica scorrevole, preceduta dall'etichetta: i generi si
 * vedono tutti senza mandare a capo mezza pagina di pillole. Sotto `lg` resta
 * solo la scritta "Per genere", che apre il foglio con l'elenco: sul telefono
 * una fila di 19 pillole è ingombrante.
 * Il tipo (film o serie) lo decide la scheda della home: i link puntano già al
 * genere giusto, quindi non serve alcuno stato oltre all'apertura del foglio.
 */
export function GenreFilter({
  entries,
  type,
}: {
  entries: GenreEntry[];
  type: "movie" | "tv";
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 8, end: max - el.scrollLeft > 8 });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  if (entries.length === 0) return null;

  const mask = `linear-gradient(to right, transparent, #000 ${
    edges.start ? `${FADE}px` : "0px"
  }, #000 calc(100% - ${edges.end ? `${FADE}px` : "0px"}), transparent)`;

  return (
    <div className="pb-5 lg:pb-6">
      {/* Telefono: solo la scritta, l'elenco sta nel foglio */}
      <div className="px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="glass flex h-9 items-center gap-1.5 rounded-full pl-4 pr-3 text-[13px] font-semibold"
        >
          Per genere
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-white/55"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Da lg: etichetta e fila unica scorrevole, sfumata dove continua */}
      <div className="hidden lg:flex lg:items-center lg:gap-4 lg:pl-10">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2">
          Per genere
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/10" />
        <div
          ref={rowRef}
          onScroll={measure}
          style={{ maskImage: mask, WebkitMaskImage: mask }}
          className="scrollbar-none flex min-w-0 flex-1 gap-2 overflow-x-auto pr-10"
        >
          {entries.map((g) => (
            <Link
              key={g.key}
              href={`/discover/${type}/${g.key}`}
              prefetch={false}
              className={PILL}
            >
              {g.pillola}
            </Link>
          ))}
        </div>
      </div>

      {/* `tall`: 19 generi in due colonne non stanno in un foglio ad altezza libera */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Per genere" size="tall">
        <div className="grid grid-cols-2 gap-2">
          {entries.map((g) => (
            <Link
              key={g.key}
              href={`/discover/${type}/${g.key}`}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center rounded-[14px] bg-surface-2 px-3 text-center text-[14px] font-medium text-white/90 transition-colors active:bg-white/[0.12]"
            >
              {g.pillola}
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
