import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Scheda titolo in arrivo: stessa geometria della testata reale (respiro con i comandi +
 * banda fissa 16:9 sotto lg, 75svh da lg), poi locandina e righe di testo sotto la banda.
 */
export default function Loading() {
  return (
    <div className="pb-36 lg:pb-16">
      <div className="pt-[calc(env(safe-area-inset-top,0px)+64px)] lg:pt-0">
        <Skeleton className="aspect-video w-full rounded-none lg:aspect-auto lg:h-[75svh]" />
      </div>
      <div className="mt-4 flex items-end gap-4 px-5 lg:mt-6 lg:px-10">
        <Skeleton className="aspect-[2/3] w-28 rounded-xl lg:w-[168px]" />
        <div className="flex-1 space-y-2 pb-1">
          <Skeleton className="h-7 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-8 space-y-2 px-5 lg:px-10">
        <Skeleton className="h-5 w-36 rounded" />
        <Skeleton className="h-[68px] w-full rounded-[20px] lg:w-[420px]" />
        <Skeleton className="h-[68px] w-full rounded-[20px] lg:w-[420px]" />
      </div>
    </div>
  );
}
