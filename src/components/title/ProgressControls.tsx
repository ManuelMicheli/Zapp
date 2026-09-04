"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { restoreEntry, setProgress } from "@/lib/watch/actions";
import type { SeasonInfo } from "@/lib/watch/episodes";

export function ProgressControls({
  titleId,
  seasons,
  season,
  episode,
  remaining,
  percent,
  nextLabel,
}: {
  titleId: number;
  seasons: SeasonInfo[];
  season: number;
  episode: number;
  remaining: number;
  /** Percentuale di episodi visti (0-100). */
  percent: number;
  /** "Prossimo: S2 E5" oppure "Ultimo episodio". */
  nextLabel: string;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickSeason, setPickSeason] = useState(season);
  const [pickEpisode, setPickEpisode] = useState(Math.max(1, episode));

  function runAction(action: () => ReturnType<typeof setProgress>, message: string) {
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
    <section className="px-5 md:px-0">
      <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface px-[18px] py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            {episode > 0 ? (
              <>
                <span className="text-xs font-medium text-accent-soft">Sei a</span>
                <span className="text-2xl font-extrabold tracking-[-0.04em]">
                  S{season} E{episode}
                </span>
              </>
            ) : (
              <span className="text-2xl font-extrabold tracking-[-0.04em]">
                Da iniziare
              </span>
            )}
          </div>
          <span className="shrink-0 text-[13px] text-muted">
            {remaining} episodi rimasti
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-soft to-accent-strong"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>{nextLabel}</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="-my-3.5 py-3.5 font-medium text-accent-soft"
          >
            Segna progresso
          </button>
        </div>
      </div>

      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Imposta progresso"
      >
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
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-3 text-base"
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
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-3 text-base"
            >
              {Array.from(
                { length: pickerSeasonInfo?.episodes ?? 1 },
                (_, i) => i + 1,
              ).map((n) => (
                <option key={n} value={n}>
                  Episodio {n}
                </option>
              ))}
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
          className="mt-4 h-[54px] w-full rounded-full bg-accent text-[17px] font-semibold text-white shadow-[var(--shadow-accent)] disabled:opacity-50"
        >
          Salva
        </button>
      </Sheet>
    </section>
  );
}
