import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16 lg:mx-auto lg:max-w-[1360px]">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
        <Skeleton className="h-10 w-28 rounded" />
      </div>
      <div className="px-5 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:px-10">
        {/* colonna laterale: ricerca e amici */}
        <div className="space-y-4 md:col-start-2 md:row-start-1">
          <Skeleton className="h-[52px] w-full rounded-full" />
          <div className="flex gap-3.5 lg:flex-col lg:gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="size-14 shrink-0 rounded-full lg:h-11 lg:w-full lg:rounded-2xl"
              />
            ))}
          </div>
        </div>
        {/* feed: un banner sotto l'altro, 21:9 da lg */}
        <div className="mt-6 flex flex-col gap-3 md:col-start-1 md:row-start-1 md:mt-0 lg:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-[16/9] w-full rounded-[24px] lg:aspect-[21/9] lg:rounded-[28px]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
