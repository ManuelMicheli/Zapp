import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-36">
      <Skeleton className="h-[420px] w-full rounded-none lg:h-[560px]" />
      <div className="mt-6 space-y-2.5 px-5 md:px-8 lg:px-10">
        <Skeleton className="h-6 w-28 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] w-full rounded-[20px] lg:h-[150px]" />
        ))}
      </div>
    </div>
  );
}
