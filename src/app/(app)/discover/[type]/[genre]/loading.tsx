import { Skeleton } from "@/components/ui/Skeleton";

/** Stessa geometria della pagina: testata, sottotitolo, pillole e griglia di copertine. */
export default function Loading() {
  return (
    <>
      <header className="flex flex-col gap-3 pb-4 pl-5 pr-[calc(var(--nav-actions)+12px)] pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:flex-row lg:items-center lg:justify-between lg:pl-10 lg:pr-10 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <div className="flex min-w-0 flex-col gap-1">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-10 w-44 rounded" />
        </div>
      </header>
      <main className="px-5 pb-16 lg:px-10">
        <Skeleton className="mb-4 h-4 w-72 max-w-full rounded" />
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-[14px]" />
          ))}
        </div>
      </main>
    </>
  );
}
