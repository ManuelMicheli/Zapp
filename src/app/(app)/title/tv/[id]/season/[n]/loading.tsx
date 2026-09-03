import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-28">
      <Skeleton className="h-28 w-full" />
      <div className="mt-4 space-y-2 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
