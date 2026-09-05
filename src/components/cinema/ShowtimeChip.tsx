"use client";

import { formatTime } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import type { Showing } from "@/lib/cinema/types";

export type ChipState = "past" | "next" | "future";

/** Orario tappabile: passato (barrato), prossimo (accent) o futuro (vetro). */
export function ShowtimeChip({
  showing,
  state,
  countdown,
  onClick,
}: {
  showing: Showing;
  state: ChipState;
  /** "tra 2 h 10", solo per `next` */
  countdown?: string;
  onClick: () => void;
}) {
  const label = formatLabel(showing.format);
  const base =
    "flex shrink-0 flex-col items-center rounded-full px-4 py-2 text-[15px] font-semibold";
  const cls =
    state === "past"
      ? `${base} bg-surface-2 text-muted-2 line-through`
      : state === "next"
        ? `${base} bg-accent text-white shadow-[var(--shadow-accent)]`
        : `${base} glass text-text`;

  return (
    <button type="button" onClick={onClick} disabled={state === "past"} className={cls}>
      <span className="flex items-center gap-1.5">
        {formatTime(showing.start)}
        {label && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
              state === "next"
                ? "bg-white/20 text-white"
                : "bg-accent/20 text-accent-pale"
            }`}
          >
            {label}
          </span>
        )}
      </span>
      {state === "next" && countdown && (
        <span className="text-[11px] font-medium text-white/80">{countdown}</span>
      )}
    </button>
  );
}
