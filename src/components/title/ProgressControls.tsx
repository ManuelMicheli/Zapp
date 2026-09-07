"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { restoreEntry, setProgress } from "@/lib/watch/actions";
import type { SeasonInfo } from "@/lib/watch/episodes";

/**
 * Card "Riprendi": il fotogramma dell'episodio da vedere occupa la scheda, con
 * numero, titolo e durata sopra il velo; un tocco su "Segna come visto" porta avanti
 * il progresso, "Cambia punto" apre il vecchio selettore stagione/episodio.
 */
export function ProgressControls({
  titleId,
  seasons,
  season,
  episode,
  remaining,
  percent,
  target,
  isLast,
  imageUrl,
  episodeName,
  runtimeLabel,
}: {
  titleId: number;
  seasons: SeasonInfo[];
  season: number;
  episode: number;
  remaining: number;
  /** Percentuale di episodi visti (0-100). */
  percent: number;
  /** Episodio mostrato nella card: il prossimo da vedere. */
  target: { season: number; episode: number };
  /** Non c'è un episodio successivo: la card mostra l'ultimo visto. */
  isLast: boolean;
  imageUrl: string | null;
  episodeName: string | null;
  runtimeLabel: string | null;
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
  const label = `S${target.season} E${target.episode}`;

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">
        {isLast ? "Ultimo episodio" : "Riprendi"}
      </h2>

      <div className="relative aspect-video w-full overflow-hidden rounded-[20px] border border-border bg-surface-2">
        {imageUrl && (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 420px, 100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.92] via-black/40 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-pale">
            {isLast ? label : `Prossimo · ${label}`}
          </span>
          {episodeName && (
            <span className="line-clamp-2 text-[17px] font-bold tracking-[-0.02em]">
              {episodeName}
            </span>
          )}
          <span className="text-xs text-white/70">
            {[runtimeLabel, `${remaining} episodi rimasti`].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            runAction(
              () => setProgress(titleId, target.season, target.episode),
              `Progresso: S${target.season}E${target.episode}`,
            )
          }
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-accent text-[15px] font-semibold text-white shadow-[var(--shadow-accent)] disabled:opacity-50"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
          Segna come visto
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-12 items-center justify-center rounded-[14px] border border-border bg-surface-2 px-[18px] text-[15px] font-semibold"
        >
          Cambia punto
        </button>
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
