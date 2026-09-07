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

/**
 * Stessa geometria del carosello vero: fondale 16:9 a tutta larghezza con le righe
 * di testo sotto (banner a tutta altezza da `lg`) e i puntini.
 */
export function HomeHeroSkeleton() {
  return (
    <section className="relative">
      <div className="overflow-hidden">
        <Skeleton className="aspect-video w-full rounded-none lg:aspect-auto lg:h-[64svh] lg:max-h-[680px] lg:min-h-[420px]" />
        <div className="space-y-2 px-5 pt-3 lg:hidden">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
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
