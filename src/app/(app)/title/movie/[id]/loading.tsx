import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16">
      <Skeleton className="h-52 w-full" />
      <div className="-mt-20 flex items-end gap-4 px-4">
        <Skeleton className="aspect-[2/3] w-28 rounded-xl" />
        <div className="flex-1 space-y-2 pb-1">
          <Skeleton className="h-6 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-8 space-y-2 px-4">
        <Skeleton className="h-5 w-36 rounded" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
