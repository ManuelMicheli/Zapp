"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { toggleFavoriteCinema } from "@/lib/cinema/favorites-actions";
import { Icon } from "./icons";

/**
 * Stella "cinema preferito": toggle ottimistico, al massimo 3 (l'errore arriva dal
 * server come toast). Dopo il salvataggio `router.refresh()` riordina le liste con il
 * preferito in testa. `onChange` riceve gli id preferiti aggiornati (per lo sheet).
 */
export function FavoriteStar({
  cinemaId,
  favorite,
  cinemaName,
  onChange,
  refresh = true,
}: {
  cinemaId: number;
  favorite: boolean;
  cinemaName: string;
  onChange?: (favoriteIds: number[]) => void;
  /** `router.refresh()` a fine azione (falso dentro lo sheet: aggiorna alla chiusura). */
  refresh?: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(favorite);
  useEffect(() => setOn(favorite), [favorite]);

  function toggle() {
    if (pending) return;
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const r = await toggleFavoriteCinema(cinemaId);
      if (!r.ok) {
        setOn(!next);
        show(r.error ?? "Errore");
        return;
      }
      onChange?.(r.favoriteIds);
      if (refresh) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={
        on ? `Togli ${cinemaName} dai preferiti` : `Aggiungi ${cinemaName} ai preferiti`
      }
      className={`glass flex size-10 shrink-0 items-center justify-center rounded-full transition-colors ${
        on ? "text-accent-pale" : "text-text"
      } ${pending ? "opacity-70" : ""}`}
    >
      <Icon name="star" size={18} filled={on} />
    </button>
  );
}
