import { PosterCard } from "@/components/ui/PosterCard";
import { getSimilarTitles } from "@/lib/similar/similar";
import type { MediaType, SimilarItem } from "@/lib/similar/types";

/** Quanti simili si mostrano: la classifica salvata ne tiene di più. */
const SHOWN = 12;

/**
 * "Simili" in griglia (scelta utente 2026-09-07, mockup "Simili e recensioni C"):
 * nello scaffale orizzontale si vedevano due locandine e mezzo, qui la selezione si
 * legge tutta insieme. Su telefono resta uno scaffale orizzontale (richiesta utente):
 * in verticale una griglia di dodici titoli allungava la pagina senza motivo. Sei
 * colonne da `lg`: con tre le locandine venivano da 230px, più grandi di quelle della
 * home e sgranate, perché TMDB serve al massimo `w500`.
 *
 * I titoli non sono più le raccomandazioni grezze di TMDB ma la classifica di
 * `src/lib/similar/`: stesso filone, non stesso genere, e sotto ogni locandina il
 * motivo per cui è lì.
 */
export function RecommendationsShelf({ items }: { items: SimilarItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Simili</h2>
      <div className="scrollbar-none -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6">
        {items.map((item) => (
          <PosterCard
            key={`${item.mediaType}-${item.id}`}
            title={item.title}
            posterPath={item.posterPath}
            year={item.year ? String(item.year) : null}
            reason={item.reason}
            href={`/title/${item.mediaType}/${item.id}`}
            className="w-28 shrink-0 md:w-auto"
            sizes="(min-width: 1024px) 150px, (min-width: 768px) 180px, 112px"
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Il pezzo che va a prendere i dati. Sta dietro un `Suspense` nella scheda: la prima
 * visita di un titolo calcola la classifica (qualche chiamata TMDB in parallelo), le
 * successive sono una lettura sola di `title_similar`, e in nessuno dei due casi il
 * resto della pagina aspetta.
 */
export async function SimilarSection({
  titleId,
  mediaType,
}: {
  titleId: number;
  mediaType: MediaType;
}) {
  const items = await getSimilarTitles(titleId, mediaType, SHOWN).catch(() => []);
  return <RecommendationsShelf items={items} />;
}
