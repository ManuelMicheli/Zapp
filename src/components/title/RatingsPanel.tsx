import { ensureRatings } from "@/lib/ratings/store";
import { zappScore } from "@/lib/ratings/score";
import type { RatingScale, RatingSource } from "@/lib/ratings/types";

/** Come si chiama ogni fonte in pagina. */
const SOURCE_LABEL: Record<RatingSource, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
  trakt: "Trakt",
  letterboxd: "Letterboxd",
  audience: "Rotten Tomatoes, pubblico",
  tomatoes: "Rotten Tomatoes, critica",
  metacritic: "Metacritic",
  rogerebert: "RogerEbert",
};

/** Chi vota: le tre fonti della critica contano critici, le altre persone. */
const VOTER_LABEL: Record<RatingSource, string> = {
  imdb: "voti",
  tmdb: "voti",
  trakt: "voti",
  letterboxd: "voti",
  audience: "voti",
  tomatoes: "critici",
  metacritic: "critici",
  rogerebert: "critici",
};

function formatValue(value: number, scale: RatingScale): string {
  const n = value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  return scale === "100" ? `${n}%` : `${n}/${scale}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} M`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("it-IT")} mila`;
  return n.toLocaleString("it-IT");
}

/**
 * Il voto della scheda titolo: lo ZappScore grande, i voti totali, e al tocco l'elenco
 * per fonte nella scala vera di ciascuna. Dove lo ZappScore non c'è ancora (catalogo
 * che si sta riempiendo, MDBList giù) si ricade sul voto TMDB come prima: la scheda non
 * resta mai senza numero per colpa nostra.
 */
export async function RatingsPanel({
  titleId,
  mediaType,
  tmdbVote,
  tmdbVotes,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
  tmdbVote: number | null;
  tmdbVotes: number | null;
}) {
  const stored = await ensureRatings(titleId, mediaType);
  const detail = stored ? zappScore(stored.sources) : null;
  const score = stored?.score ?? null;

  if (score === null) {
    if (tmdbVote === null || tmdbVote <= 0) return null;
    return (
      <div className="flex items-baseline gap-2">
        <Star />
        <b className="text-xl font-bold tracking-[-0.03em]">
          {tmdbVote.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
        </b>
        <span className="text-xs text-muted">
          /10
          {tmdbVotes && tmdbVotes > 0
            ? ` · ${tmdbVotes.toLocaleString("it-IT")} voti TMDB`
            : " TMDB"}
        </span>
      </div>
    );
  }

  const rows = detail?.breakdown ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <Star />
        <b className="text-xl font-bold tracking-[-0.03em]">
          {score.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
        </b>
        <span className="text-xs text-muted">
          /10 · ZappScore
          {stored && stored.votes > 0 ? ` · ${formatCount(stored.votes)} voti` : ""}
        </span>
      </div>

      {stored?.confidence === "low" && (
        <p className="text-xs text-muted-2">Poche valutazioni: il voto può cambiare.</p>
      )}

      {rows.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-accent-soft">
            Da dove viene
          </summary>
          <dl className="mt-3 flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.source} className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] text-muted">{SOURCE_LABEL[r.source]}</dt>
                <dd className="text-[13px] font-medium">
                  {formatValue(r.value, r.scale)}
                  {r.votes > 0 && (
                    <span className="text-muted-2">
                      {" "}
                      · {formatCount(r.votes)} {VOTER_LABEL[r.source]}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-[1.4] text-muted-2">
            Voti da {rows.map((r) => SOURCE_LABEL[r.source].split(",")[0]).join(", ")} via
            MDBList. Lo ZappScore pesa ogni fonte sui suoi voti e tiene pubblico e critica
            in due bacini distinti.
          </p>
        </details>
      )}
    </div>
  );
}

function Star() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="#facc15"
      aria-hidden="true"
      className="self-center"
    >
      <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
    </svg>
  );
}
