import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="h-9 w-28 rounded" />
      </div>
      <div className="space-y-4 px-5 lg:px-10">
        <Skeleton className="h-[52px] w-full rounded-full md:max-w-[380px]" />
        <div className="flex gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="size-14 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/9] w-full rounded-[24px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
