import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="h-9 w-36 rounded" />
      </div>
      <div className="grid gap-3 px-5 md:grid-cols-2 lg:gap-4 lg:px-10 min-[1800px]:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/9] w-full rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
