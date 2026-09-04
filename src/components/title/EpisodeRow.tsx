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

  // w780: su mobile il fotogramma è a tutta larghezza (fino a ~350 css px × 3 dpr)
  const still = episode.still_path
    ? `${TMDB_IMAGE_BASE}/w780${episode.still_path}`
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
      className={`rounded-[20px] border bg-surface p-2.5 transition-opacity lg:p-3 ${
        isNext && !isWatched
          ? "border-accent/55 ring-[3px] ring-accent/[0.14]"
          : "border-border"
      } ${isWatched ? "opacity-55" : ""} ${pending ? "opacity-70" : ""}`}
    >
      {/* mobile: fotogramma 16:9 a tutta larghezza con badge in vetro, testo sotto;
          da tablet: riga con fotogramma a sinistra e trama accanto */}
      <button
        type="button"
        onClick={handleTap}
        className="flex w-full flex-col gap-3 text-left md:flex-row md:items-start lg:gap-4"
      >
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[14px] bg-surface-2 md:w-[160px] md:rounded-[10px] lg:w-[224px] lg:rounded-[12px]">
          {still && (
            <Image
              src={still}
              alt=""
              fill
              sizes="(min-width: 1024px) 224px, (min-width: 768px) 160px, calc(100vw - 60px)"
              className="object-cover"
            />
          )}
          {/* sfumatura in basso solo su mobile: rende leggibile il badge episodio */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent md:hidden" />
          <span className="glass absolute bottom-2.5 left-2.5 flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold md:hidden">
            E{episode.episode_number}
            {episode.runtime ? (
              <span className="ml-1.5 font-medium text-white/70">
                {episode.runtime} min
              </span>
            ) : null}
          </span>
          {isWatched && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
              <span className="glass-strong flex size-11 items-center justify-center rounded-full md:size-8">
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
              </span>
            </div>
          )}
          {isNext && !isWatched && (
            <span className="absolute left-2.5 top-2.5 flex h-6 items-center rounded-full bg-accent px-2.5 text-[11px] font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.45)] md:left-1.5 md:top-1.5 md:h-5 md:px-2 md:text-[10px]">
              Prossimo
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-1 pb-1 md:px-0 md:py-0.5">
          <p className="text-[16px] font-semibold leading-[1.25] md:text-sm lg:text-[15px]">
            <span className="text-muted">{episode.episode_number}.</span> {episode.name}
          </p>
          {meta.length > 0 && <p className="text-xs text-muted">{meta.join(", ")}</p>}
          {episode.overview && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/70 md:mt-1">
              {episode.overview}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}
