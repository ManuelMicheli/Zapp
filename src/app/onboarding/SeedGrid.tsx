"use client";

import Image from "next/image";
import { posterUrl } from "@/lib/config";
import { SEED_MAX_PICKS, type SeedCandidate } from "@/lib/taste/seed";

/**
 * Il passo 2 dell'onboarding. Lo stato lo tiene il form padre, così l'invio resta una
 * sola Server Action e non serve stato condiviso fra due componenti.
 *
 * **Nessuna altezza massima e nessuno scroll interno.** Con `max-h-[46vh]
 * overflow-y-auto` su un telefono si vedevano due righe e mezzo e la terza tagliata a
 * metà: sembravano copertine sovrapposte, non una griglia (segnalato dall'utente il
 * 2026-09-08). Qui scorre la pagina, che è l'unica cosa che uno si aspetta di scorrere.
 */
export function SeedGrid({
  candidates,
  selected,
  onToggle,
}: {
  candidates: SeedCandidate[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {candidates.map((c) => {
          const key = `${c.mediaType}-${c.id}`;
          const scelto = selected.includes(key);
          const pieno = selected.length >= SEED_MAX_PICKS && !scelto;
          const src = posterUrl(c.posterPath, "w342");
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              disabled={pieno}
              aria-pressed={scelto}
              aria-label={c.title}
              className={`relative aspect-[2/3] overflow-hidden rounded-[12px] bg-surface-2 transition ${
                scelto ? "ring-2 ring-accent" : ""
              } ${pieno ? "opacity-40" : ""}`}
            >
              {src && (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 31vw, 140px"
                  className="object-cover"
                />
              )}
              {scelto && (
                <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-[13px] font-bold text-bg">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="px-1 text-xs text-muted-2">
        {selected.length === 0
          ? `Puoi sceglierne fino a ${SEED_MAX_PICKS}, oppure andare avanti così.`
          : `${selected.length} di ${SEED_MAX_PICKS} scelti`}
      </p>
    </div>
  );
}
