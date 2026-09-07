import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Carosello in testa alla home (il titolo e la pillola Film / Serie TV stanno
 * fuori dal Suspense, in `HomeTypeSwitch`).
 * Sta dietro un Suspense: legge TMDB (cache Next 1h, chiamate condivise con Scopri)
 * e la libreria per i gusti; il resto della pagina non l'aspetta.
 */
export async function HomeHero() {
  const { movie, tv } = await getHomeHero();
  return <HeroCarousel movie={movie} tv={tv} />;
}

/** Stessa geometria del carosello vero: fila di card 2:3 e puntini. */
export function HomeHeroSkeleton() {
  return (
    <section>
      <div className="flex gap-3 overflow-hidden px-5 pb-1 lg:px-10">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton
            key={i}
            className="aspect-[2/3] w-[200px] shrink-0 rounded-[20px] lg:w-[240px]"
          />
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full bg-white/20 ${i === 0 ? "w-5" : "w-1.5"}`}
          />
        ))}
      </div>
    </section>
  );
}
