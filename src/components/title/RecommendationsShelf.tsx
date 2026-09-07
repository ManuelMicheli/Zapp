import { PosterCard } from "@/components/ui/PosterCard";
import type { TmdbMultiResult, TmdbPaginated } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";

/**
 * "Simili" in griglia (scelta utente 2026-09-07, mockup "Simili e recensioni C"):
 * nello scaffale orizzontale si vedevano due locandine e mezzo, qui la selezione si
 * legge tutta insieme. Su telefono resta uno scaffale orizzontale (richiesta utente):
 * in verticale una griglia di dodici titoli allungava la pagina senza motivo. Sei
 * colonne da `lg`: con tre le locandine venivano da 230px, più grandi di quelle della
 * home e sgranate, perché TMDB serve al massimo `w500`.
 */
export function RecommendationsShelf({
  recommendations,
}: {
  recommendations: TmdbPaginated<TmdbMultiResult> | undefined;
}) {
  const items = (recommendations?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 12);
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Simili</h2>
      <div className="scrollbar-none -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6">
        {items.map((item) => (
          <PosterCard
            key={`${item.media_type}-${item.id}`}
            title={searchResultTitle(item)}
            posterPath={item.poster_path ?? null}
            year={searchResultYear(item)}
            href={`/title/${item.media_type}/${item.id}`}
            className="w-28 shrink-0 md:w-auto"
            sizes="(min-width: 1024px) 150px, (min-width: 768px) 180px, 112px"
          />
        ))}
      </div>
    </section>
  );
}
