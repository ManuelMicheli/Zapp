import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbSeasonEpisode } from "@/lib/tmdb/types";
import { EpisodeActions } from "./EpisodeActions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function EpisodeRow({ episode }: { episode: TmdbSeasonEpisode }) {
  const still = episode.still_path
    ? `${TMDB_IMAGE_BASE}/w300${episode.still_path}`
    : null;

  const meta: string[] = [];
  if (episode.runtime) meta.push(`${episode.runtime} min`);
  if (episode.air_date) meta.push(formatDate(episode.air_date));

  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex gap-3">
        <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {still && (
            <Image src={still} alt="" fill sizes="112px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            <span className="text-muted">{episode.episode_number}.</span>{" "}
            {episode.name}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</p>
          )}
        </div>
        <EpisodeActions />
      </div>
      {episode.overview && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-accent">
            Trama
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-text/80">
            {episode.overview}
          </p>
        </details>
      )}
    </div>
  );
}
