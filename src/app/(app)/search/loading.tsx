import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
        <Skeleton className="h-10 w-32 rounded" />
      </div>
      <div className="px-5 pb-4 pt-3.5 lg:px-10">
        <Skeleton className="h-[52px] w-full rounded-full lg:max-w-[640px]" />
      </div>
      <DiscoverSkeleton shelves={2} />
    </div>
  );
}
