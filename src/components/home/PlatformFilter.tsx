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

/**
 * Filtro per piattaforma in testa alla home, sotto quello per genere.
 * Stessa geometria di `GenreFilter`: da `lg` una fila unica scorrevole preceduta
 * dall'etichetta, sotto `lg` solo la scritta "Per piattaforma", che apre il foglio.
 *
 * Come i generi, una pillola **cambia l'ambito della home** (`/home/netflix`,
 * `/home/thriller/netflix`) invece di aprire una pagina a parte: la home resta quella,
 * con ogni sezione ristretta a quel servizio (richiesta utente 2026-09-15). La pillola
 * attiva è evidenziata e un secondo tocco la toglie; il genere già scelto resta nel
 * link. Sul telefono la scritta diventa logo e nome del servizio scelto.
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

  const attiva = scope.platform?.key ?? null;
  const hrefDi = (p: PlatformPill) =>
    scopePath({
      genre: scope.genre,
      platform: attiva === p.key ? null : (platformByKey(p.key) ?? null),
    });
  const senzaPiattaforma = scopePath({ genre: scope.genre, platform: null });
  const scelta = entries.find((p) => p.key === attiva) ?? null;

  return (
    <div className="pb-5 lg:pb-6">
      {/* Telefono: solo la scritta, l'elenco sta nel foglio */}
      <div className="flex justify-center px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-platform-chip=""
          className={`${scelta ? "glass-accent pl-1.5" : "glass pl-4"} flex h-9 items-center gap-1.5 rounded-full pr-3 text-[13px] font-semibold`}
        >
          {scelta ? (
            <>
              <Logo p={scelta} size={24} />
              {scelta.pillola}
            </>
          ) : (
            "Per piattaforma"
          )}
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
              href={hrefDi(p)}
              prefetch={false}
              aria-current={attiva === p.key ? "page" : undefined}
              data-platform-pill=""
              className={`${PILL} ${attiva === p.key ? PILL_ON : PILL_OFF}`}
            >
              <Logo p={p} size={24} />
              {p.pillola}
            </Link>
          ))}
        </HorizontalScroll>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Per piattaforma">
        <div className="grid grid-cols-2 gap-2">
          {scelta && (
            <Link
              href={senzaPiattaforma}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="col-span-2 flex h-12 items-center justify-center rounded-[14px] border border-white/15 px-3 text-center text-[14px] font-medium text-white/80 transition-colors active:bg-white/[0.12]"
            >
              Tutte le piattaforme
            </Link>
          )}
          {entries.map((p) => (
            <Link
              key={p.key}
              href={hrefDi(p)}
              prefetch={false}
              data-platform-pill=""
              onClick={() => setOpen(false)}
              aria-current={attiva === p.key ? "page" : undefined}
              className={`flex h-12 items-center gap-2.5 rounded-[14px] px-3 text-[14px] font-medium transition-colors active:bg-white/[0.12] ${
                attiva === p.key
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
