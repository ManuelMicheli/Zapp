import { POSTER_GRID_DESKTOP } from "@/components/ui/PosterCard";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="flex flex-col gap-6 px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
      <Skeleton className="h-10 w-48 rounded" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-[88px] shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-2/3 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-full lg:w-64" />
      <div className={`grid grid-cols-3 gap-4 md:grid-cols-4 ${POSTER_GRID_DESKTOP}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
