import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Home: hero + uno scaffale, stessa geometria della pagina reale. */
export default function Loading() {
  return (
    <div className="pb-16">
      <Skeleton className="h-[420px] w-full rounded-none lg:h-[520px]" />
      <div className="mt-8 space-y-8">
        <DiscoverSkeleton shelves={2} />
      </div>
    </div>
  );
}
