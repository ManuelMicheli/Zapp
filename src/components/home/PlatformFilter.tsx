"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import { Sheet } from "@/components/ui/Sheet";
import { platformByKey } from "@/lib/platforms/catalog";
import { scopePath, type HomeScope } from "@/lib/home/scope";
import { NAV_FILTRO_LABEL } from "./filter-label";

/** Una voce del catalogo delle piattaforme, col logo già risolto dal server. */
export interface PlatformPill {
  key: string;
  pillola: string;
  logo: string | null;
}

const PILL =
  "flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-medium transition-colors";
const PILL_OFF =
  "border-white/[0.08] bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/[0.09] hover:text-white";
const PILL_ON = "border-white/30 bg-white/[0.16] text-white";

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

/** La "x" che azzera in un tocco solo il filtro per piattaforma, tenendo il genere. */
function Reset({ href }: { href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label="Azzera il filtro per piattaforma"
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60 transition-colors hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M6 6 18 18M18 6 6 18" />
      </svg>
    </Link>
  );
}

/** "Netflix", "Netflix +2": l'etichetta della scritta sul telefono. */
function etichetta(scelte: PlatformPill[]): string {
  if (scelte.length === 0) return "Per piattaforma";
  if (scelte.length === 1) return scelte[0].pillola;
  return `${scelte[0].pillola} +${scelte.length - 1}`;
}

/**
 * Filtro per piattaforma in testa alla home, sotto quello per genere.
 * Stessa geometria di `GenreFilter`: da `lg` una fila unica scorrevole preceduta
 * dall'etichetta, sotto `lg` solo la scritta "Per piattaforma", che apre il foglio.
 *
 * A differenza dei generi **si può scegliere più di una piattaforma**: le pillole
 * scelte sono in **or** ("cosa c'è su Netflix, Prime o Disney+"), non si escludono a
 * vicenda, e ogni tocco le accende o le spegne senza toccare le altre (richiesta utente
 * 2026-09-15). Una pillola cambia l'ambito della home (`/home/netflix`,
 * `/home/thriller/netflix/prime-video`) invece di aprire una pagina a parte: la home
 * resta quella, con ogni sezione ristretta a quel servizio. Il genere già scelto resta
 * nel link. Con almeno una piattaforma scelta compare una "x" che le azzera tutte in un
 * tocco, tenendo il genere. Sul telefono la scritta diventa il nome della prima
 * piattaforma scelta ("Netflix +2" con le altre).
 * `data-platform-pill` serve a `scripts/platform-check.mjs`.
 */
export function PlatformFilter({
  entries,
  scope,
}: {
  entries: PlatformPill[];
  scope: HomeScope;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const attive = new Set(scope.platforms.map((p) => p.key));
  const hrefDi = (p: PlatformPill) => {
    const nuove = attive.has(p.key)
      ? scope.platforms.filter((sp) => sp.key !== p.key)
      : [...scope.platforms, platformByKey(p.key)].filter((e) => e !== undefined);
    return scopePath({ genre: scope.genre, platforms: nuove });
  };
  const senzaPiattaforma = scopePath({ genre: scope.genre, platforms: [] });
  const scelte = entries.filter((p) => attive.has(p.key));

  return (
    <div className="pb-5 lg:pb-6">
      {/* Telefono: solo la scritta (e la "x" se c'è già una scelta), l'elenco sta nel foglio */}
      <div className="flex items-center justify-center gap-2 px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-platform-chip=""
          className={`${scelte.length > 0 ? "glass-accent pl-1.5" : "glass pl-4"} flex h-9 items-center gap-1.5 rounded-full pr-3 text-[13px] font-semibold`}
        >
          {scelte.length > 0 ? <Logo p={scelte[0]} size={24} /> : null}
          {etichetta(scelte)}
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
        {scelte.length > 0 && <Reset href={senzaPiattaforma} />}
      </div>

      {/* Da lg: etichetta, la "x" quando c'è una scelta, e la fila scorrevole */}
      <div className="hidden lg:flex lg:items-center lg:justify-center lg:gap-4 lg:px-10">
        <span
          style={{ width: NAV_FILTRO_LABEL }}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2"
        >
          Per piattaforma
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/10" />
        {scelte.length > 0 && <Reset href={senzaPiattaforma} />}
        <HorizontalScroll
          label="Piattaforme"
          wrapperClassName="min-w-0"
          className="scrollbar-none flex gap-2 overflow-x-auto px-10"
        >
          {entries.map((p) => (
            <Link
              key={p.key}
              href={hrefDi(p)}
              prefetch={false}
              aria-current={attive.has(p.key) ? "page" : undefined}
              data-platform-pill=""
              className={`${PILL} ${attive.has(p.key) ? PILL_ON : PILL_OFF}`}
            >
              <Logo p={p} size={24} />
              {p.pillola}
            </Link>
          ))}
        </HorizontalScroll>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Per piattaforma">
        <div className="grid grid-cols-2 gap-2">
          {scelte.length > 0 && (
            <Link
              href={senzaPiattaforma}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="col-span-2 flex h-12 items-center justify-center rounded-[14px] border border-white/15 px-3 text-center text-[14px] font-medium text-white/80 transition-colors active:bg-white/[0.12]"
            >
              Azzera le piattaforme
            </Link>
          )}
          {entries.map((p) => (
            <Link
              key={p.key}
              href={hrefDi(p)}
              prefetch={false}
              data-platform-pill=""
              aria-current={attive.has(p.key) ? "page" : undefined}
              className={`flex h-12 items-center gap-2.5 rounded-[14px] px-3 text-[14px] font-medium transition-colors active:bg-white/[0.12] ${
                attive.has(p.key)
                  ? "bg-white/[0.18] text-white"
                  : "bg-surface-2 text-white/90"
              }`}
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
