import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { HomeHeroSkeleton } from "@/components/home/HomeHero";
import { Skeleton } from "@/components/ui/Skeleton";

/** Home: testata col carosello, hero e uno scaffale, stessa geometria della pagina reale. */
export default function Loading() {
  return (
    <div className="pb-16">
      <HomeHeroSkeleton />
      <Skeleton className="mt-8 h-[420px] w-full rounded-none lg:h-[520px]" />
      <div className="mt-8 space-y-8">
        <DiscoverSkeleton shelves={2} />
      </div>
    </div>
  );
}
