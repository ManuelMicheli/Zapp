"use client";

import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { CharacterChart as ChartData } from "@/lib/characters/rank";

/**
 * Il grafico del personaggio preferito: barre orizzontali, una per personaggio,
 * col volto dell'interprete, la percentuale e i voti. Sta sotto al cast, nella
 * stessa colonna stretta: per questo è una lista di righe e non un anello.
 */
export function CharacterChart({ chart }: { chart: ChartData }) {
  if (chart.total === 0) {
    return (
      <p className="text-sm text-muted">
        Nessun voto ancora: tocca un volto qui sopra per dare il tuo.
      </p>
    );
  }

  const max = Math.max(...chart.bars.map((b) => b.votes), 1);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {chart.bars.map((bar) => (
          <li key={bar.personId} className="flex items-center gap-3">
            <div
              className={`relative size-8 shrink-0 overflow-hidden rounded-full border bg-surface-2 ${
                bar.mine ? "border-accent-soft" : "border-white/[0.08]"
              }`}
            >
              {bar.profilePath ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${bar.profilePath}`}
                  alt={bar.name ?? bar.character}
                  fill
                  sizes="32px"
                  className="object-cover object-[50%_20%]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-muted">
                  {(bar.character || bar.name || "?").charAt(0)}
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold">
                  {bar.character || bar.name}
                  {bar.mine && (
                    <span className="ml-1.5 text-xs font-medium text-accent-soft">
                      il tuo
                    </span>
                  )}
                </p>
                <p className="shrink-0 text-xs tabular-nums text-muted">
                  <span className="font-semibold text-text">{bar.share}%</span>
                  {" · "}
                  {bar.votes}
                </p>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={bar.share}
                aria-label={`${bar.character || bar.name}: ${bar.share} per cento`}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
                    bar.mine ? "bg-accent-light" : "bg-accent"
                  }`}
                  style={{ width: `${Math.max(4, (bar.votes / max) * 100)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">
        {chart.total === 1 ? "1 voto" : `${chart.total} voti`}
        {chart.others && ` · altri personaggi ${chart.others.share}%`}
      </p>
    </div>
  );
}
