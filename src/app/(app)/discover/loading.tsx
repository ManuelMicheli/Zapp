import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-36 pt-16">
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="mb-8">
          <Skeleton className="mx-5 mb-3 h-5 w-48 rounded lg:mx-10" />
          <div className="flex gap-3 overflow-hidden px-5 lg:px-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-28 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
