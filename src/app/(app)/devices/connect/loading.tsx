import { Skeleton } from "@/components/ui/Skeleton";

/** Stessa geometria della pagina vera: testata, due righe di testo, bottone. */
export default function Loading() {
  return (
    <main className="relative pb-16">
      <div className="flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-64 rounded" />
      </div>
      <div className="mt-7 flex flex-col gap-5 px-5 lg:max-w-[560px] lg:px-10">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-[54px] rounded-full" />
      </div>
    </main>
  );
}
