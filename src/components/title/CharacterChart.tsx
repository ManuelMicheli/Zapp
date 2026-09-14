"use client";

import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { CharacterChart as ChartData } from "@/lib/characters/rank";
import type { CharacterPortrait } from "@/lib/characters/match";

/**
 * Il grafico del personaggio preferito: una barra orizzontale per personaggio,
 * col ritratto in piccolo (2:3, come la card), la percentuale e i voti. Le
 * prime cinque più il proprio voto se sta oltre, il resto in "altri".
 */
export function CharacterChart({
  chart,
  portraits,
}: {
  chart: ChartData;
  portraits: Record<number, CharacterPortrait>;
}) {
  if (chart.total === 0) {
    return (
      <p className="text-sm text-muted">
        Nessun voto ancora: il grafico compare col primo.
      </p>
    );
  }

  const max = Math.max(...chart.bars.map((b) => b.votes), 1);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-[-0.01em] text-muted">
        Come hanno votato
      </h3>
      <ul className="flex flex-col gap-2.5">
        {chart.bars.map((bar) => {
          // ritratto del personaggio, altrimenti la foto dell'interprete (come la card)
          const portrait =
            portraits[bar.personId]?.image ??
            (bar.profilePath ? `${TMDB_IMAGE_BASE}/w185${bar.profilePath}` : null);
          return (
            <li key={bar.personId} className="flex items-center gap-3">
              <div
                className={`relative h-12 w-8 shrink-0 overflow-hidden rounded-[7px] bg-surface-2 ${
                  bar.mine ? "shadow-[0_0_0_1.5px_var(--color-accent-soft)]" : ""
                }`}
              >
                {portrait ? (
                  <Image
                    src={portrait}
                    alt=""
                    fill
                    unoptimized
                    sizes="32px"
                    className="object-cover object-[50%_18%]"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-muted">
                    {(bar.character || bar.name || "?").charAt(0)}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
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
                    {bar.votes === 1 ? "1 voto" : `${bar.votes} voti`}
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
          );
        })}
      </ul>
      {chart.others && (
        <p className="text-xs text-muted">Altri personaggi: {chart.others.share}%</p>
      )}
    </div>
  );
}
