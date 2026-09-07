"use client";

import { useState } from "react";
import Image from "next/image";
import { Sheet } from "@/components/ui/Sheet";
import { restoreEntry, setProgress, type EntrySnapshot } from "@/lib/watch/actions";
import { useOptimisticValue } from "@/lib/ui/optimistic";
import {
  episodesWatched,
  nextEpisode,
  remainingEpisodes,
  totalEpisodes,
  type SeasonInfo,
} from "@/lib/watch/episodes";

/**
 * Card "Riprendi": il fotogramma dell'episodio da vedere, con numero, titolo e durata
 * sopra il velo; un tocco su "Segna come visto" porta avanti il progresso, "Cambia
 * punto" apre il selettore stagione/episodio. Da `md` la card è larga al massimo
 * 480px (560 da `lg`): a tutta colonna, su un desktop da 1440, il fotogramma veniva
 * alto oltre 500px, fuori scala rispetto a locandine e galleria.
 */
export function ProgressControls({
  titleId,
  seasons,
  season,
  episode,
  imageUrl,
  episodeName,
  runtimeLabel,
}: {
  titleId: number;
  seasons: SeasonInfo[];
  season: number;
  episode: number;
  /** Episodi rimasti al momento del render server: solo per il primo giro,
   * poi la card ricalcola da `point` (vedi sotto). */
  remaining: number;
  /** Percentuale di episodi visti al momento del render server (0-100). */
  percent: number;
  /** Episodio mostrato al momento del render server: il prossimo da vedere. */
  target: { season: number; episode: number };
  /** Non c'è un episodio successivo al momento del render server. */
  isLast: boolean;
  imageUrl: string | null;
  episodeName: string | null;
  runtimeLabel: string | null;
}) {
  const { value: point, pending, run } = useOptimisticValue({ season, episode });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickSeason, setPickSeason] = useState(point.season);
  const [pickEpisode, setPickEpisode] = useState(Math.max(1, point.episode));

  // Tutto quel che si ricava da season/episode (etichetta, barra, episodi
  // rimasti) segue subito il valore ottimistico: senza questo la card mostrava
  // ancora il vecchio punto finché il server non rispondeva.
  const clientNext = nextEpisode(seasons, point.season, point.episode);
  const clientTarget = clientNext ?? {
    season: point.season,
    episode: Math.max(1, point.episode),
  };
  const clientIsLast = clientNext === null && point.episode > 0;
  const clientRemaining = remainingEpisodes(seasons, point.season, point.episode);
  const totalEp = totalEpisodes(seasons);
  const clientPercent =
    totalEp > 0
      ? Math.round(
          (episodesWatched(seasons, point.season, point.episode) / totalEp) * 100,
        )
      : 0;

  function apply(nextSeason: number, nextEpisode: number) {
    let prev: EntrySnapshot | null = null;
    run(
      { season: nextSeason, episode: nextEpisode },
      async () => {
        const result = await setProgress(titleId, nextSeason, nextEpisode);
        prev = result.prev;
        return result;
      },
      {
        message: `Progresso: S${nextSeason}E${nextEpisode}`,
        undo: () => {
          void restoreEntry(titleId, "tv", prev);
        },
      },
    );
  }

  const pickerSeasonInfo = seasons.find((s) => s.season === pickSeason);
  const label = `S${clientTarget.season} E${clientTarget.episode}`;

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">
        {clientIsLast ? "Ultimo episodio" : "Riprendi"}
      </h2>

      <div className="relative aspect-video w-full max-w-[560px] overflow-hidden rounded-[20px] border border-border bg-surface-2 md:max-w-[480px] lg:max-w-[560px]">
        {imageUrl && (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 560px, (min-width: 768px) 480px, 100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.92] via-black/40 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-pale">
            {clientIsLast ? label : `Prossimo · ${label}`}
          </span>
          {episodeName && (
            <span className="line-clamp-2 text-[17px] font-bold tracking-[-0.02em]">
              {episodeName}
            </span>
          )}
          <span className="text-xs text-white/70">
            {[runtimeLabel, `${clientRemaining} episodi rimasti`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
          <div className="h-full bg-accent" style={{ width: `${clientPercent}%` }} />
        </div>
      </div>

      <div className="flex max-w-[560px] gap-2.5 md:max-w-[480px] lg:max-w-[560px]">
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(clientTarget.season, clientTarget.episode)}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] glass-accent text-[15px] font-semibold text-white disabled:opacity-50"
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
            apply(pickSeason, pickEpisode);
          }}
          className="mt-4 h-[54px] w-full rounded-full glass-accent text-[17px] font-semibold text-white disabled:opacity-50"
        >
          Salva
        </button>
      </Sheet>
    </section>
  );
}
