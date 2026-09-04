import { Skeleton } from "@/components/ui/Skeleton";

/** Placeholder degli scaffali Scopri mentre TMDB risponde. */
export function DiscoverSkeleton({ shelves = 2 }: { shelves?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: shelves }).map((_, s) => (
        <div key={s}>
          <Skeleton className="mx-5 mb-3 h-5 w-48 rounded lg:mx-10" />
          <div className="flex gap-3 overflow-hidden px-5 lg:px-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-[2/3] w-28 shrink-0 rounded-[14px] lg:w-[140px]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
