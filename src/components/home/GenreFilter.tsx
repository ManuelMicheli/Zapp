"use client";

import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { GenreEntry } from "@/lib/genres/catalog";
import { scopePath, type HomeScope } from "@/lib/home/scope";
import { NAV_FILTRO_LABEL } from "./filter-label";

const PILL =
  "flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors";
const PILL_OFF =
  "border-white/[0.08] bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/[0.09] hover:text-white";
const PILL_ON = "border-white/30 bg-white/[0.16] text-white";

/**
 * Filtro per genere in testa alla home.
 * Da `lg` è una fila unica scorrevole, preceduta dall'etichetta: i generi si
 * vedono tutti senza mandare a capo mezza pagina di pillole. Sotto `lg` resta
 * solo la scritta "Per genere", che apre il foglio con l'elenco: sul telefono
 * una fila di 19 pillole è ingombrante.
 *
 * Una pillola **non apre una pagina di Scopri**: cambia l'ambito della home
 * (`/home/thriller`, `/home/thriller/netflix`), che resta la stessa pagina con ogni
 * sezione ristretta a quel genere (richiesta utente 2026-09-15). La pillola attiva è
 * evidenziata e un secondo tocco la toglie; la piattaforma già scelta resta nel link,
 * così "Storie vere" e "Netflix" si intrecciano. Sul telefono la scritta diventa il
 * nome del genere scelto. Il tipo (film o serie) non entra nel link: lo decide la
 * scheda della home, che è stato client e sopravvive alla navigazione.
 */
export function GenreFilter({
  entries,
  scope,
}: {
  entries: GenreEntry[];
  scope: HomeScope;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const attivo = scope.genre?.key ?? null;
  const hrefDi = (g: GenreEntry) =>
    scopePath({ genre: attivo === g.key ? null : g, platform: scope.platform });
  const senzaGenere = scopePath({ genre: null, platform: scope.platform });

  return (
    <div className="pb-5 lg:pb-6">
      {/* Telefono: solo la scritta, l'elenco sta nel foglio */}
      <div className="flex justify-center px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-genre-chip=""
          className={`${scope.genre ? "glass-accent" : "glass"} flex h-9 items-center gap-1.5 rounded-full pl-4 pr-3 text-[13px] font-semibold`}
        >
          {scope.genre ? scope.genre.pillola : "Per genere"}
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
        {/* `w-[128px]`: "Per piattaforma" è più larga di "Per genere" e i due gruppi
            sono centrati ognuno per sé, quindi senza una larghezza comune le due file
            di pillole partono da due x diverse. La misura sta in `NAV_FILTRO_LABEL`. */}
        <span
          style={{ width: NAV_FILTRO_LABEL }}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2"
        >
          Per genere
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/10" />
        <HorizontalScroll
          label="Generi"
          // `min-w-0` senza `flex-1`: il gruppo etichetta + pillole sta al centro
          // quando ci sta, e si stringe scorrendo quando i generi sono troppi
          wrapperClassName="min-w-0"
          className="scrollbar-none flex gap-2 overflow-x-auto px-10"
        >
          {entries.map((g) => (
            <Link
              key={g.key}
              href={hrefDi(g)}
              prefetch={false}
              aria-current={attivo === g.key ? "page" : undefined}
              data-genre-pill=""
              className={`${PILL} ${attivo === g.key ? PILL_ON : PILL_OFF}`}
            >
              {g.pillola}
            </Link>
          ))}
        </HorizontalScroll>
      </div>

      {/* `tall`: 19 generi in due colonne non stanno in un foglio ad altezza libera */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Per genere" size="tall">
        <div className="grid grid-cols-2 gap-2">
          {scope.genre && (
            <Link
              href={senzaGenere}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="col-span-2 flex h-12 items-center justify-center rounded-[14px] border border-white/15 px-3 text-center text-[14px] font-medium text-white/80 transition-colors active:bg-white/[0.12]"
            >
              Tutti i generi
            </Link>
          )}
          {entries.map((g) => (
            <Link
              key={g.key}
              href={hrefDi(g)}
              prefetch={false}
              onClick={() => setOpen(false)}
              aria-current={attivo === g.key ? "page" : undefined}
              data-genre-pill=""
              className={`flex h-12 items-center justify-center rounded-[14px] px-3 text-center text-[14px] font-medium transition-colors active:bg-white/[0.12] ${
                attivo === g.key
                  ? "bg-white/[0.18] text-white"
                  : "bg-surface-2 text-white/90"
              }`}
            >
              {g.pillola}
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
