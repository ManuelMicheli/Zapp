import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="h-9 w-28 rounded" />
      </div>
      <div className="space-y-4 px-5 lg:px-10">
        <Skeleton className="h-[52px] w-full rounded-full md:max-w-[380px]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
            <Skeleton className="h-16 w-11 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
