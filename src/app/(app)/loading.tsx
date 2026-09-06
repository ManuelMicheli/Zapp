import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { ContinueRowSkeleton } from "@/components/home/ContinueRow";
import { HomeHeroSkeleton } from "@/components/home/HomeHero";

/** Home: testata col carosello, fila "Continua a guardare" e scaffali, stessa geometria della pagina. */
export default function Loading() {
  return (
    <div className="pb-16">
      <HomeHeroSkeleton />
      <div className="mt-8">
        <ContinueRowSkeleton />
      </div>
      <div className="mt-8 space-y-8">
        <DiscoverSkeleton shelves={2} />
      </div>
    </div>
  );
}
