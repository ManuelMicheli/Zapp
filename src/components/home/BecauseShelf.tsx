"use client";

import { useState } from "react";
import {
  PosterCard,
  SHELF_CARD_CLASS,
  SHELF_CARD_SIZES,
} from "@/components/ui/PosterCard";
import type { BecauseSource } from "@/lib/home/shelves-rank";
import type { SimilarItem } from "@/lib/similar/types";

const PILL =
  "flex h-9 max-w-[220px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors";
const PILL_OFF =
  "border-white/[0.08] bg-white/[0.04] text-white/75 hover:border-white/25";
const PILL_ON = "border-white/25 bg-white/[0.14] text-white";

export interface BecauseVariant {
  source: BecauseSource;
  items: SimilarItem[];
}

/**
 * "Perché hai visto X" con le pillole degli ultimi titoli finiti: l'utente sceglie
 * da quale partire e lo scaffale mostra i titoli dello stesso filone di quello,
 * ciascuno con il motivo per cui è lì. Tutte le liste arrivano già pronte dal server,
 * quindi cambiare pillola non torna indietro a chiedere nulla — come le pillole delle
 * piattaforme in "Da vedere".
 */
export function BecauseShelf({ variants }: { variants: BecauseVariant[] }) {
  const [chosen, setChosen] = useState(0);
  const current = variants[chosen] ?? variants[0];
  if (!current) return null;

  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        <h2 className="text-xl font-bold tracking-[-0.03em]">
          Perché hai visto {current.source.name}
        </h2>
      </div>

      {variants.length > 1 && (
        <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto px-5 pb-1 lg:px-10">
          {variants.map((variant, i) => (
            <button
              key={`${variant.source.mediaType}-${variant.source.titleId}`}
              type="button"
              onClick={() => setChosen(i)}
              aria-pressed={i === chosen}
              className={`${PILL} ${i === chosen ? PILL_ON : PILL_OFF}`}
            >
              <span className="truncate">{variant.source.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
        {current.items.map((item, i) => (
          <PosterCard
            key={`${item.mediaType}-${item.id}`}
            className={SHELF_CARD_CLASS}
            sizes={SHELF_CARD_SIZES}
            title={item.title}
            posterPath={item.posterPath}
            year={item.year ? String(item.year) : null}
            reason={item.reason}
            href={`/title/${item.mediaType}/${item.id}`}
            preview
            signal={{ surface: "home-perche", position: i }}
          />
        ))}
      </div>
    </section>
  );
}
