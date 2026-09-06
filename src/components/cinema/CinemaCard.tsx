"use client";

import { formatCountdown, minutesUntil } from "@/lib/cinema/dates";
import type { Cinema, Showing } from "@/lib/cinema/types";
import { CinemaHeader } from "./CinemaHeader";
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
  action,
  children,
}: {
  cinema: Cinema;
  showings: Showing[];
  nearest?: boolean;
  /** Bottone a destra dell'intestazione (stella preferito). */
  action?: React.ReactNode;
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
      <CinemaHeader cinema={cinema} nearest={nearest} action={action} />

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
