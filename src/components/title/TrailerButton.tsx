import type { TmdbVideos } from "@/lib/tmdb/types";

/** Trova un trailer YouTube (preferisce quelli ufficiali). Nessun embed: apre YouTube. */
export function TrailerButton({ videos }: { videos: TmdbVideos | undefined }) {
  const list = videos?.results ?? [];
  const trailer =
    list.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
    list.find((v) => v.site === "YouTube" && v.type === "Trailer");
  if (!trailer) return null;

  return (
    <a
      href={`https://www.youtube.com/watch?v=${trailer.key}`}
      target="_blank"
      rel="noopener"
      className="glass ml-auto flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M10 9.5v5l4-2.5z" fill="currentColor" stroke="none" />
      </svg>
      Trailer
    </a>
  );
}
