import { ensureRatings } from "@/lib/ratings/store";
import { formatVotes } from "@/lib/ratings/format";

/**
 * Il voto della scheda titolo: lo ZappScore grande e i voti totali, lo stesso numero
 * che ora sta sotto ogni copertina in tutta l'app. **Niente elenco per fonte**: il
 * "Da dove viene" è stato tolto su richiesta dell'utente (2026-09-08) — in pagina
 * conta il voto, non da quali siti arriva. Dove lo ZappScore non c'è ancora (catalogo
 * che si sta riempiendo, MDBList giù) si ricade sul voto TMDB come prima: la scheda non
 * resta mai senza numero per colpa nostra.
 *
 * Chiude la trama (slot `ratings` di `TitleAbout`), quindi porta con sé il filo che lo
 * separa dal testo: senza alcun voto qui non esce niente, filo compreso.
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
  const score = stored?.score ?? null;

  if (score === null) {
    if (tmdbVote === null || tmdbVote <= 0) return null;
    return (
      <>
        <div className="h-px bg-border" />
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
      </>
    );
  }

  return (
    <>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <Star />
          <b className="text-xl font-bold tracking-[-0.03em]">
            {score.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          </b>
          <span className="text-xs text-muted">
            /10 · ZappScore
            {stored && stored.votes > 0 ? ` · ${formatVotes(stored.votes)} voti` : ""}
          </span>
        </div>

        {stored?.confidence === "low" && (
          <p className="text-xs text-muted-2">Poche valutazioni: il voto può cambiare.</p>
        )}
      </div>
    </>
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
