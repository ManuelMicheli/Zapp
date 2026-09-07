import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Carosello in testa alla home (il titolo e la pillola Tutto / Film / Serie TV stanno
 * fuori dal Suspense, in `HomeTypeSwitch`).
 * Sta dietro un Suspense: legge TMDB (cache Next 1h, chiamate condivise con Scopri)
 * e la libreria per i gusti; il resto della pagina non l'aspetta.
 */
export async function HomeHero() {
  const { movie, tv, all } = await getHomeHero();
  return <HeroCarousel movie={movie} tv={tv} all={all} />;
}

/** Stessa geometria del carosello vero: una card grande (banner da `lg`) e i puntini. */
export function HomeHeroSkeleton() {
  return (
    <section className="relative">
      <div className="flex gap-4 overflow-hidden px-5 pb-1 lg:gap-0 lg:px-0 lg:pb-0">
        <Skeleton className="aspect-[2/3] w-[calc(100%-52px)] shrink-0 rounded-[24px] lg:aspect-auto lg:h-[64svh] lg:max-h-[680px] lg:min-h-[420px] lg:w-full lg:rounded-none" />
      </div>
      <div className="mt-3 flex justify-center gap-1.5 lg:absolute lg:bottom-8 lg:right-10 lg:mt-0">
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
