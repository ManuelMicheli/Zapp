"use client";

import { formatCountdown, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { Cinema, Showing } from "@/lib/cinema/types";
import { Icon } from "./icons";
import { ShowtimeChip, type ChipState } from "./ShowtimeChip";

/**
 * Card di un cinema con i suoi orari. Il primo spettacolo futuro è "next";
 * con ≤ 2 spettacoli futuri oggi compare "Ultimi spettacoli oggi".
 */
export function CinemaCard({
  cinema,
  showings,
  nearest = false,
  nowMs,
  onPick,
  children,
}: {
  cinema: Cinema;
  showings: Showing[];
  nearest?: boolean;
  /** Ora corrente in ms (dal server, per un primo render coerente). */
  nowMs: number;
  onPick: (showing: Showing) => void;
  /** Contenuto extra sotto gli orari (es. film, nella vista per cinema). */
  children?: React.ReactNode;
}) {
  const future = showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
  const nextStart = future[0]?.start ?? null;
  // Se qualche spettacolo è già passato, il giorno selezionato è oggi
  // (non basta "ci sono spettacoli futuri": sarebbe vero anche per un giorno futuro).
  const isToday = future.length < showings.length;

  function stateOf(s: Showing): ChipState {
    if (minutesUntil(s.start, nowMs) < 0) return "past";
    return s.start === nextStart ? "next" : "future";
  }

  return (
    <article className="rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[17px] font-bold tracking-[-0.02em]">
              {cinema.name}
            </h3>
            {nearest && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-pale">
                Il più vicino
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {cinema.address}
            {cinema.city ? `, ${cinema.city}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right text-[13px] leading-tight">
          <p className="font-semibold">{formatDistance(cinema.distanceKm)}</p>
          <p className="text-muted">{walkingMinutes(cinema.distanceKm)} min a piedi</p>
        </div>
      </div>

      {isToday && future.length > 0 && future.length <= 2 && (
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-pale">
          <Icon name="clock" size={13} /> Ultimi spettacoli oggi
        </p>
      )}

      <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {showings.map((s) => {
          const state = stateOf(s);
          return (
            <ShowtimeChip
              key={`${s.start}-${s.format}`}
              showing={s}
              state={state}
              countdown={
                state === "next"
                  ? formatCountdown(minutesUntil(s.start, nowMs))
                  : undefined
              }
              onClick={() => onPick(s)}
            />
          );
        })}
      </div>

      {children}
    </article>
  );
}
