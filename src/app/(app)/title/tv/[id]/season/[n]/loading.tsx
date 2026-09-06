import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-36 lg:pb-16">
      {/* stessa geometria della testata: respiro con i comandi + banda fissa 16:9 sotto lg,
        75svh da lg */}
      <div className="pt-[calc(env(safe-area-inset-top,0px)+64px)] lg:pt-0">
        <Skeleton className="aspect-video w-full rounded-none lg:aspect-auto lg:h-[75svh]" />
      </div>
      <div className="mt-4 flex items-end gap-4 px-5 md:px-8 lg:mt-6 lg:px-10">
        <Skeleton className="aspect-[2/3] w-[108px] rounded-xl lg:w-[152px]" />
        <div className="flex-1 space-y-2 pb-1">
          <Skeleton className="h-7 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-6 space-y-2.5 px-5 md:px-8 lg:px-10">
        <Skeleton className="h-6 w-28 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[300px] w-full rounded-[20px] md:h-[120px] lg:h-[150px]"
          />
        ))}
      </div>
    </div>
  );
}
