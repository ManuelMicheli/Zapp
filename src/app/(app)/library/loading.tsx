import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <div className="pl-5 pr-[calc(var(--nav-actions)+12px)] pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
        <Skeleton className="h-10 w-36 rounded" />
      </div>
      <div className="mt-4 flex gap-2 px-5 lg:px-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[38px] w-28 rounded-full" />
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3 px-5 lg:px-10">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-4 px-5 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 lg:px-10">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
