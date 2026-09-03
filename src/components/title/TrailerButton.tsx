import type { TmdbVideos } from "@/lib/tmdb/types";

/** Trova un trailer YouTube (preferisce quelli ufficiali). Nessun embed: apre YouTube. */
export function TrailerButton({ videos }: { videos: TmdbVideos | undefined }) {
  const list = videos?.results ?? [];
  const trailer =
    list.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
    list.find((v) => v.site === "YouTube" && v.type === "Trailer");
  if (!trailer) return null;

  return (
    <div className="px-4">
      <a
        href={`https://www.youtube.com/watch?v=${trailer.key}`}
        target="_blank"
        rel="noopener"
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold transition-colors hover:bg-surface-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        Guarda il trailer su YouTube
      </a>
    </div>
  );
}
