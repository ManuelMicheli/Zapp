import type { ReactNode } from "react";
import { formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { Cinema } from "@/lib/cinema/types";

/**
 * Intestazione di un cinema: nome (+ badge "Il più vicino"), indirizzo,
 * distanza e minuti a piedi. `action` (es. bottone Indicazioni) va dopo il
 * blocco distanza. Condivisa da `CinemaCard` e `VenuesView`.
 */
export function CinemaHeader({
  cinema,
  nearest = false,
  action,
}: {
  cinema: Cinema;
  nearest?: boolean;
  action?: ReactNode;
}) {
  return (
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
        {action}
      </div>
    </div>
  );
}
