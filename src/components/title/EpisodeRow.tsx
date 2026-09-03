"use client";

import Image from "next/image";
import { useTransition } from "react";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import { useToast } from "@/components/ui/Toaster";
import { restoreEntry, setProgress } from "@/lib/watch/actions";

export interface EpisodeData {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Riga episodio con tap che imposta la posizione (ultimo episodio visto).
 * È una posizione, non una checklist: toccare un episodio precedente
 * riporta indietro il progresso.
 */
export function EpisodeRow({
  episode,
  titleId,
  watchedSeason,
  watchedEpisode,
}: {
  episode: EpisodeData;
  titleId: number;
  watchedSeason: number | null;
  watchedEpisode: number | null;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const isWatched =
    watchedSeason != null &&
    watchedEpisode != null &&
    (episode.season_number < watchedSeason ||
      (episode.season_number === watchedSeason &&
        episode.episode_number <= watchedEpisode));

  const still = episode.still_path
    ? `${TMDB_IMAGE_BASE}/w300${episode.still_path}`
    : null;

  const meta: string[] = [];
  if (episode.runtime) meta.push(`${episode.runtime} min`);
  if (episode.air_date) meta.push(formatDate(episode.air_date));

  function handleTap() {
    startTransition(async () => {
      const result = await setProgress(
        titleId,
        episode.season_number,
        episode.episode_number,
      );
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      show(`Sei a S${episode.season_number}E${episode.episode_number}`, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(titleId, "tv", result.prev);
          });
        },
      });
    });
  }

  return (
    <div
      className={`rounded-xl border border-border bg-surface p-2.5 transition-opacity ${
        isWatched ? "opacity-50" : ""
      } ${pending ? "opacity-70" : ""}`}
    >
      <button type="button" onClick={handleTap} className="flex w-full gap-3 text-left">
        <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {still && (
            <Image src={still} alt="" fill sizes="112px" className="object-cover" />
          )}
          {isWatched && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            <span className="text-muted">{episode.episode_number}.</span> {episode.name}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</p>
          )}
        </div>
      </button>
      {episode.overview && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-accent">
            Trama
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-text/80">{episode.overview}</p>
        </details>
      )}
    </div>
  );
}
