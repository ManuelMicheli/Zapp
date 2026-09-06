"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { MAX_FAVORITE_CINEMAS } from "@/lib/cinema/favorites";
import { formatDistance } from "@/lib/cinema/geo";
import type { Cinema } from "@/lib/cinema/types";
import { FavoriteStar } from "./FavoriteStar";
import { Icon } from "./icons";

/**
 * "★ Preferiti 2/3": apre lo sheet "I tuoi cinema" con i cinema vicini e la stella
 * per sceglierne fino a 3. Le liste orari li mettono sempre in testa.
 */
export function FavoritesChip({ cinemas }: { cinemas: Cinema[] }) {
  const [open, setOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() =>
    cinemas.filter((c) => c.favorite).map((c) => c.id),
  );
  // La Server Action rimanda la pagina aggiornata (`revalidatePath`): `cinemas` arriva
  // già coi preferiti in testa. Nello sheet l'ordine resta per distanza, così le righe
  // non saltano sotto il dito.
  const rows = useMemo(
    () => [...cinemas].sort((a, b) => a.distanceKm - b.distanceKm),
    [cinemas],
  );
  const count = favoriteIds.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
          count > 0
            ? "bg-accent/20 text-accent-pale"
            : "border border-border bg-surface text-muted"
        }`}
      >
        <Icon name="star" size={13} filled={count > 0} />
        Preferiti {count}/{MAX_FAVORITE_CINEMAS}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="I tuoi cinema">
        <p className="mb-3 text-[13px] text-muted">
          Scegli fino a {MAX_FAVORITE_CINEMAS} cinema: i loro orari vengono sempre prima.
        </p>
        <ul className="scrollbar-none -mx-1 flex max-h-[60svh] flex-col gap-1 overflow-y-auto px-1 pb-4">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{c.name}</p>
                <p className="truncate text-[13px] text-muted">
                  {c.city}
                  {c.city ? " · " : ""}
                  {formatDistance(c.distanceKm)}
                </p>
              </div>
              <FavoriteStar
                cinemaId={c.id}
                cinemaName={c.name}
                favorite={favoriteIds.includes(c.id)}
                refresh={false}
                onChange={setFavoriteIds}
              />
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
