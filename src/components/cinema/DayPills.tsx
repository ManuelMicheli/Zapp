"use client";

import Link from "next/link";
import type { DayOption } from "@/lib/cinema/dates";

/**
 * Selettore del giorno (Oggi | Domani | Mer 9): pillola in vetro con la voce attiva in
 * rilievo, come `ViewSwitch`. Con `hrefs` (data → URL) le voci sono link (pagina
 * Cinema, il giorno sta nell'URL: una mappa, non una funzione, perché arriva da un
 * Server Component); con `onSelect` sono bottoni (scheda film, i tre giorni sono già
 * caricati). `empty` smorza le voci senza spettacoli.
 */
export function DayPills({
  days,
  active,
  hrefs,
  onSelect,
  empty,
}: {
  days: DayOption[];
  active: string;
  hrefs?: Record<string, string>;
  onSelect?: (date: string) => void;
  /** Date senza spettacoli: la voce resta cliccabile ma smorzata. */
  empty?: Set<string>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Giorno"
      className="glass inline-flex gap-0.5 rounded-full p-[3px]"
    >
      {days.map((d) => {
        const on = d.date === active;
        const dim = !on && empty?.has(d.date);
        const cls = `flex h-8 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
          on
            ? "bg-white/[0.14] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
            : dim
              ? "text-muted-2 hover:text-muted"
              : "text-muted hover:text-text"
        }`;
        const href = hrefs?.[d.date];
        return href ? (
          <Link key={d.date} href={href} role="tab" aria-selected={on} className={cls}>
            {d.label}
          </Link>
        ) : (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect?.(d.date)}
            className={cls}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
