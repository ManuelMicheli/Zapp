"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { incrementEpisode, restoreEntry, setProgress } from "@/lib/watch/actions";
import type { SeasonInfo } from "@/lib/watch/episodes";

export function ProgressControls({
  titleId,
  seasons,
  season,
  episode,
  remaining,
}: {
  titleId: number;
  seasons: SeasonInfo[];
  season: number;
  episode: number;
  remaining: number;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickSeason, setPickSeason] = useState(season);
  const [pickEpisode, setPickEpisode] = useState(Math.max(1, episode));

  function runAction(action: () => ReturnType<typeof incrementEpisode>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      show(message, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(titleId, "tv", result.prev);
          });
        },
      });
    });
  }

  const pickerSeasonInfo = seasons.find((s) => s.season === pickSeason);

  return (
    <section id="series-progress" className="px-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-sm font-semibold">
            {episode > 0 ? `Sei a S${season}E${episode}` : "Non hai ancora iniziato"}
          </p>
          <p className="text-xs text-muted">
            {remaining} episodi rimasti · tocca per impostare
          </p>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => runAction(() => incrementEpisode(titleId), "Episodio segnato")}
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          +1 episodio
        </button>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Imposta progresso">
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">Stagione</span>
            <select
              value={pickSeason}
              onChange={(e) => {
                const s = Number(e.target.value);
                setPickSeason(s);
                setPickEpisode(1);
              }}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-base"
            >
              {seasons.map((s) => (
                <option key={s.season} value={s.season}>
                  Stagione {s.season}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">Episodio</span>
            <select
              value={pickEpisode}
              onChange={(e) => setPickEpisode(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-base"
            >
              {Array.from({ length: pickerSeasonInfo?.episodes ?? 1 }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    Episodio {n}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPickerOpen(false);
            runAction(
              () => setProgress(titleId, pickSeason, pickEpisode),
              `Progresso: S${pickSeason}E${pickEpisode}`,
            );
          }}
          className="mt-4 w-full rounded-xl bg-accent py-3 text-base font-bold text-white disabled:opacity-50"
        >
          Salva
        </button>
      </Sheet>
    </section>
  );
}
