import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <Skeleton className="h-[480px] w-full rounded-none lg:h-[620px]" />
      <div className="space-y-3.5 px-5 pt-8 lg:px-10">
        <Skeleton className="h-6 w-44 rounded" />
        <Skeleton className="h-[200px] rounded-[22px]" />
      </div>
      <div className="space-y-3 px-5 pt-8 lg:px-10">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
      </div>
    </div>
  );
}
