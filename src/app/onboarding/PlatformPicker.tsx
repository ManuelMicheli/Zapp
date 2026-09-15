"use client";

import { PLATFORMS } from "@/lib/platforms/catalog";

const PILL =
  "flex h-12 items-center justify-center rounded-full border px-3 text-center text-[14px] font-medium transition-colors active:bg-white/[0.12]";
const PILL_OFF =
  "border-white/[0.08] bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/[0.09] hover:text-white";
const PILL_ON = "border-white/30 bg-white/[0.16] text-white";

/**
 * Le pillole del passo "Cosa guardi?": due colonne su telefono, come le griglie a
 * pillole già in app (`GenreFilter`/`PlatformFilter`, foglio). Selezione multipla,
 * nessuna icona esterna: solo `pillola` del catalogo.
 */
export function PlatformPicker({
  scelte,
  onToggle,
}: {
  scelte: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PLATFORMS.map((p) => {
        const attiva = scelte.includes(p.key);
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onToggle(p.key)}
            aria-pressed={attiva}
            className={`${PILL} ${attiva ? PILL_ON : PILL_OFF}`}
          >
            {p.pillola}
          </button>
        );
      })}
    </div>
  );
}
