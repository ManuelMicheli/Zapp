"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import { Sheet } from "@/components/ui/Sheet";
import { NAV_FILTRO_LABEL } from "./filter-label";

/** Una voce del catalogo delle piattaforme, col logo già risolto dal server. */
export interface PlatformPill {
  key: string;
  pillola: string;
  logo: string | null;
}

const PILL =
  "flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] pl-1.5 pr-3.5 text-[13px] font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.09] hover:text-white";

/** Il logo del servizio, o la sua iniziale quando TMDB non lo dà. */
function Logo({ p, size }: { p: PlatformPill; size: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.08]"
    >
      {p.logo ? (
        <Image
          src={p.logo}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-bold text-white/70">{p.pillola[0]}</span>
      )}
    </span>
  );
}

/**
 * Filtro per piattaforma in testa alla home, sotto quello per genere.
 * Stessa geometria di `GenreFilter`: da `lg` una fila unica scorrevole preceduta
 * dall'etichetta, sotto `lg` solo la scritta "Per piattaforma", che apre il foglio.
 * Il tipo (film o serie) lo decide la scheda della home, quindi i link puntano già
 * al posto giusto e non serve altro stato oltre all'apertura del foglio.
 *
 * I link vanno sulla **stessa rotta dei generi** (`/discover/movie/netflix`): il perché
 * sta scritto in `src/app/(app)/discover/[type]/[genre]/page.tsx`. `data-platform-pill`
 * serve solo a `scripts/platform-check.mjs` per distinguerle dalle pillole dei generi,
 * che ora hanno lo stesso prefisso.
 */
export function PlatformFilter({
  entries,
  type,
}: {
  entries: PlatformPill[];
  type: "movie" | "tv";
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="pb-5 lg:pb-6">
      {/* Telefono: solo la scritta, l'elenco sta nel foglio */}
      <div className="flex justify-center px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="glass flex h-9 items-center gap-1.5 rounded-full pl-4 pr-3 text-[13px] font-semibold"
        >
          Per piattaforma
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
      <div className="hidden lg:flex lg:items-center lg:justify-center lg:gap-4 lg:px-10">
        <span
          style={{ width: NAV_FILTRO_LABEL }}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2"
        >
          Per piattaforma
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/10" />
        <HorizontalScroll
          label="Piattaforme"
          wrapperClassName="min-w-0"
          className="scrollbar-none flex gap-2 overflow-x-auto px-10"
        >
          {entries.map((p) => (
            <Link
              key={p.key}
              href={`/discover/${type}/${p.key}`}
              prefetch={false}
              data-platform-pill=""
              className={PILL}
            >
              <Logo p={p} size={24} />
              {p.pillola}
            </Link>
          ))}
        </HorizontalScroll>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Per piattaforma">
        <div className="grid grid-cols-2 gap-2">
          {entries.map((p) => (
            <Link
              key={p.key}
              href={`/discover/${type}/${p.key}`}
              prefetch={false}
              data-platform-pill=""
              onClick={() => setOpen(false)}
              className="flex h-12 items-center gap-2.5 rounded-[14px] bg-surface-2 px-3 text-[14px] font-medium text-white/90 transition-colors active:bg-white/[0.12]"
            >
              <Logo p={p} size={28} />
              <span className="truncate">{p.pillola}</span>
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
