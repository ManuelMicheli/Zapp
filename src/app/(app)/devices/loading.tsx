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
      <div className="mx-auto mt-9 max-w-[1120px] px-5 lg:mt-12 lg:px-10">
        <div className="grid items-center gap-8 pb-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div className="space-y-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-28 w-full max-w-[420px]" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-52 rounded-full" />
          </div>
          <Skeleton className="h-64 rounded-[24px]" />
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="mt-8 h-96 rounded-2xl" />
      </div>
    </main>
  );
}
