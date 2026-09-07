import { Skeleton } from "@/components/ui/Skeleton";
import { getHomeHero } from "@/lib/home/hero";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Testata della home: titolo, scelta Film / Serie TV e carosello delle card grandi.
 * Sta dietro un Suspense: legge TMDB (cache Next 1h, chiamate condivise con Scopri)
 * e la libreria per i gusti; il resto della pagina non l'aspetta.
 */
export async function HomeHero() {
  const { movie, tv } = await getHomeHero();
  return <HeroCarousel movie={movie} tv={tv} />;
}

/** Stessa geometria della testata vera: titolo, pillola e fila di card 2:3. */
export function HomeHeroSkeleton() {
  return (
    <section>
      <div className="flex items-center justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="h-[34px] w-[110px] rounded-xl" />
        <Skeleton className="h-10 w-[150px] rounded-full" />
      </div>
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
