"use client";

import Image from "next/image";
import { posterUrl } from "@/lib/config";
import { SEED_MAX_PICKS, SEED_MIN_PICKS, type SeedCandidate } from "@/lib/taste/seed";

/**
 * Il passo 2 dell'onboarding: "scegline almeno 3 che ti piacciono".
 *
 * Lo stato lo tiene il form padre, così l'invio resta una sola Server Action e non
 * serve stato condiviso fra due componenti.
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
      <div className="grid max-h-[46vh] grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4 lg:max-h-[52vh] lg:grid-cols-5">
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
                  sizes="(max-width: 640px) 30vw, 140px"
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
        {selected.length}/{SEED_MAX_PICKS} scelti · ne servono almeno {SEED_MIN_PICKS}
      </p>
    </div>
  );
}
