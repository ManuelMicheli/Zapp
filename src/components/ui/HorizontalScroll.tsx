"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Scorrimento nativo con comandi ai bordi per chi naviga da desktop. */
export function HorizontalScroll({
  children,
  className,
  label = "Elenco",
  wrapperClassName = "",
}: {
  children: ReactNode;
  className: string;
  label?: string;
  wrapperClassName?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const id = useId();
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const prev = el.scrollLeft > 1;
      const next = max - el.scrollLeft > 1;
      setEdges((old) => (old.prev === prev && old.next === next ? old : { prev, next }));
    };
    // Osserviamo anche le card: filtri, immagini e sezioni nascoste possono
    // cambiare la larghezza del contenuto senza ridimensionare il contenitore.
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(el);
      for (const child of el.children) resize.observe(child);
      measure();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(el, { childList: true });
    el.addEventListener("scroll", measure, { passive: true });
    observe();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  function move(direction: number) {
    const el = row.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <div ref={row} id={id} className={className}>
        {children}
      </div>
      {(edges.prev || edges.next) &&
        (["prev", "next"] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={`${label}: scorri ${direction === "prev" ? "a sinistra" : "a destra"}`}
            aria-controls={id}
            disabled={!edges[direction]}
            onClick={() => move(direction === "prev" ? -1 : 1)}
            className={`absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-25 lg:flex ${direction === "prev" ? "left-1" : "right-1"}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={direction === "prev" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
            </svg>
          </button>
        ))}
    </div>
  );
}
