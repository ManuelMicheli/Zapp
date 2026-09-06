"use client";

import { useEffect, useState } from "react";
import { formatCountdown, formatTime, minutesUntil } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { directionsUrl, formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { NextShowing } from "@/lib/cinema/programme";
import { Icon } from "./icons";

/**
 * "Prossimo spettacolo" in testa alla sezione cinema della scheda film ("Scheda B"):
 * l'orario più vicino fra tutte le sale in cifre grandi e leggere, la sala con
 * distanza e minuti a piedi, Biglietti (apre il foglio dello spettacolo) e, se la card
 * è larga almeno 560px (container query: nella scheda sta nella colonna da 420px),
 * Indicazioni. Sotto la card la lista completa delle sale con tutti gli orari.
 */
export function NextShowingCard({
  pick,
  nowMs,
  onPick,
}: {
  pick: NextShowing;
  nowMs: number;
  onPick: (pick: NextShowing) => void;
}) {
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);
  const { cinema, showing } = pick;
  const fmt = formatLabel(showing.format);

  return (
    <article className="@container relative overflow-hidden rounded-[20px] border border-border bg-surface p-[18px] lg:px-7 lg:py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-32 size-80 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.3)_0%,rgba(0,0,0,0)_65%)] blur-2xl"
      />
      <div className="relative flex flex-col gap-1">
        <p className="text-[12px] font-semibold text-accent-pale">
          Prossimo spettacolo · {formatCountdown(minutesUntil(showing.start, nowMs))}
        </p>
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-baseline gap-2 tabular-nums text-[52px] font-light leading-[0.95] tracking-[-0.06em] lg:text-[64px]">
            {formatTime(showing.start)}
            {fmt && (
              <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-accent-pale">
                {fmt}
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <a
              href={directionsUrl(cinema, ios)}
              target="_blank"
              rel="noopener"
              className="glass hidden h-11 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold @[560px]:inline-flex"
            >
              <Icon name="nav" size={16} /> Indicazioni
            </a>
            <button
              type="button"
              onClick={() => onPick(pick)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-[18px] text-[15px] font-semibold text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong"
            >
              <Icon name="ticket" size={16} /> Biglietti
            </button>
          </div>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[15px] font-semibold">
          <span className="truncate">{cinema.name}</span>
          {cinema.favorite && (
            <span className="shrink-0 text-accent-pale">
              <Icon name="star" size={13} filled />
            </span>
          )}
        </p>
        <p className="truncate text-[13px] text-muted">
          {cinema.address} · {formatDistance(cinema.distanceKm)} ·{" "}
          {walkingMinutes(cinema.distanceKm)} min a piedi
        </p>
      </div>
    </article>
  );
}
