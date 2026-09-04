import type { TmdbVideo, TmdbVideos } from "@/lib/tmdb/types";

/**
 * Primo trailer YouTube della lista, preferendo quelli ufficiali. Non c'è mai un
 * link a YouTube: il trailer viene riprodotto muto come fondale della scheda
 * (`CinematicBackdrop`), come su Netflix.
 */
export function findTrailer(videos: TmdbVideos | undefined): TmdbVideo | null {
  const list = videos?.results ?? [];
  return (
    list.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
    list.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
    null
  );
}
