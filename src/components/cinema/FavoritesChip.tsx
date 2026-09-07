"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { MAX_FAVORITE_CINEMAS } from "@/lib/cinema/favorites";
import { formatDistance } from "@/lib/cinema/geo";
import { venueTier } from "@/lib/cinema/rank";
import type { Cinema } from "@/lib/cinema/types";
import { FavoriteStar } from "./FavoriteStar";
import { Icon } from "./icons";

/** Sopra questo numero di sale compare il campo di ricerca nel foglio. */
const SEARCH_FROM = 8;

/** Titoli dei gruppi del foglio: grandi catene, multisala, sale indipendenti. */
const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: "Grandi catene",
  2: "Multisala",
  3: "Altre sale",
};

/**
 * "★ Preferiti 2/3": apre lo sheet "I tuoi cinema" con tutte le sale entro il raggio,
 * nell'ordine delle liste (preferiti, grandi catene UCI / The Space / Notorious,
 * multisala, indipendenti; a parità per distanza), raggruppate per livello, con la
 * stella per sceglierne fino a 3 e un campo di ricerca. Le liste orari mettono i
 * preferiti sempre in testa.
 */
export function FavoritesChip({ cinemas }: { cinemas: Cinema[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() =>
    cinemas.filter((c) => c.favorite).map((c) => c.id),
  );
  // La Server Action rimanda la pagina aggiornata (`revalidatePath`): `cinemas` arriva
  // già coi preferiti in testa. Nello sheet l'ordine è per livello e distanza, stabile
  // mentre si tocca la stella, così le righe non saltano sotto il dito.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...cinemas]
      .filter((c) => !q || `${c.name} ${c.city}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = venueTier(a.name);
        const tb = venueTier(b.name);
        return ta !== tb ? ta - tb : a.distanceKm - b.distanceKm;
      });
    return ([1, 2, 3] as const)
      .map((tier) => ({ tier, rows: rows.filter((c) => venueTier(c.name) === tier) }))
      .filter((g) => g.rows.length > 0);
  }, [cinemas, query]);
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
        {cinemas.length > SEARCH_FROM && (
          <label className="mb-3 flex h-11 items-center gap-2 rounded-[14px] bg-surface-2 px-3.5">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca un cinema"
              aria-label="Cerca un cinema"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-2"
            />
          </label>
        )}
        <div className="scrollbar-none -mx-1 flex max-h-[60svh] flex-col gap-3 overflow-y-auto px-1 pb-4">
          {groups.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted">
              Nessun cinema con questo nome
            </p>
          )}
          {groups.map(({ tier, rows }) => (
            <section key={tier} className="flex flex-col gap-1">
              <h3 className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">
                {TIER_LABELS[tier]}
              </h3>
              <ul className="flex flex-col gap-1">
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
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
