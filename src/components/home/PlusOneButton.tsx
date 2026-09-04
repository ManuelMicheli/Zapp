"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { incrementEpisode, restoreEntry } from "@/lib/watch/actions";

/**
 * Segna l'episodio successivo di una serie in corso.
 * Il toast mostra il nuovo punto della serie e permette di annullare.
 */
export function PlusOneButton({
  titleId,
  className = "",
}: {
  titleId: number;
  className?: string;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  function plusOne() {
    startTransition(async () => {
      const result = await incrementEpisode(titleId);
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      const label =
        result.entry?.status === "watched"
          ? "Serie completata!"
          : `Sei a S${result.entry?.season_number}E${result.entry?.episode_number}`;
      show(label, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(titleId, "tv", result.prev);
          });
        },
      });
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={plusOne}
      className={`disabled:opacity-50 ${className}`}
    >
      +1 ep
    </button>
  );
}
