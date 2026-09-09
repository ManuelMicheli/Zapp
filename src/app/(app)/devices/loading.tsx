import { Skeleton } from "@/components/ui/Skeleton";

/** Stessa geometria della pagina vera: testata con indietro + titolo, poi
 * il bottone di collegamento e un paio di righe dispositivo. */
export default function Loading() {
  return (
    <main className="relative pb-16">
      <div className="flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-40 rounded" />
      </div>
      <div className="mt-7 flex flex-col gap-4 px-5 lg:px-10">
        <Skeleton className="h-[54px] rounded-full" />
        <Skeleton className="h-[86px] rounded-[20px]" />
        <Skeleton className="h-[86px] rounded-[20px]" />
      </div>
    </main>
  );
}
