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
  isNext = false,
}: {
  episode: EpisodeData;
  titleId: number;
  watchedSeason: number | null;
  watchedEpisode: number | null;
  /** Primo episodio non visto dopo quelli visti: evidenziato con il badge "Prossimo". */
  isNext?: boolean;
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
      className={`rounded-[20px] border bg-surface p-2.5 transition-opacity ${
        isNext && !isWatched
          ? "border-accent/55 ring-[3px] ring-accent/[0.14]"
          : "border-border"
      } ${isWatched ? "opacity-55" : ""} ${pending ? "opacity-70" : ""}`}
    >
      <button type="button" onClick={handleTap} className="flex w-full gap-3 text-left">
        <div className="relative h-[66px] w-[118px] shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
          {still && (
            <Image src={still} alt="" fill sizes="118px" className="object-cover" />
          )}
          {isWatched && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent-pale"
                aria-hidden="true"
              >
                <path d="M5 12l4.5 4.5L19 7" />
              </svg>
            </div>
          )}
          {isNext && !isWatched && (
            <span className="absolute left-1.5 top-1.5 flex h-5 items-center rounded-full bg-accent px-2 text-[10px] font-bold text-white">
              Prossimo
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className="text-sm font-semibold leading-[1.25]">
            <span className="text-muted">{episode.episode_number}.</span> {episode.name}
          </p>
          {meta.length > 0 && <p className="text-xs text-muted">{meta.join(", ")}</p>}
        </div>
      </button>
      {episode.overview && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none py-1 text-xs font-semibold text-accent-soft">
            Trama
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-white/70">{episode.overview}</p>
        </details>
      )}
    </div>
  );
}
