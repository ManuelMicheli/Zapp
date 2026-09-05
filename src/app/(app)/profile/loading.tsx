import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <Skeleton className="h-[400px] w-full rounded-none" />
      <div className="grid grid-cols-3 gap-2.5 px-5 pt-5 lg:px-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-[20px]" />
        ))}
      </div>
      <div className="space-y-3 px-5 pt-8 lg:px-10">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
      </div>
    </div>
  );
}
