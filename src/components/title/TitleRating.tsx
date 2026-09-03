export function TitleRating({
  voteAverage,
  voteCount,
}: {
  voteAverage: number | null;
  voteCount: number | null;
}) {
  if (voteAverage == null || voteAverage === 0) return null;

  return (
    <section className="px-4">
      <div className="flex items-center gap-2">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="#facc15"
          aria-hidden="true"
        >
          <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
        </svg>
        <span className="text-lg font-bold">{voteAverage.toFixed(1)}</span>
        <span className="text-sm text-muted">/ 10</span>
        {voteCount != null && voteCount > 0 && (
          <span className="text-xs text-muted">
            · {voteCount.toLocaleString("it-IT")} voti
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted">
        Voto TMDB. This product uses the TMDB API but is not endorsed or
        certified by TMDB.
      </p>
    </section>
  );
}
