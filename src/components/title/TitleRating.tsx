import type { ReactNode } from "react";

/** Riga voto TMDB + slot a destra (trailer). */
export function TitleRating({
  voteAverage,
  voteCount,
  trailer,
}: {
  voteAverage: number | null;
  voteCount: number | null;
  trailer?: ReactNode;
}) {
  const hasVote = voteAverage != null && voteAverage > 0;
  if (!hasVote && !trailer) return null;

  return (
    <section className="px-5 lg:px-0">
      <div className="flex items-center justify-between gap-4">
        {hasVote ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="#facc15"
                aria-hidden="true"
                className="self-center"
              >
                <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
              </svg>
              <span className="text-[22px] font-bold tracking-[-0.03em]">
                {voteAverage.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
              </span>
              <span className="text-[13px] text-muted">
                / 10
                {voteCount != null && voteCount > 0
                  ? `, ${voteCount.toLocaleString("it-IT")} voti`
                  : ""}
              </span>
            </div>
            <span className="text-[10px] text-muted-2">Voto TMDB</span>
          </div>
        ) : (
          <span />
        )}
        {trailer}
      </div>
      <p className="mt-2 text-[10px] text-muted-2">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </section>
  );
}
