import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

/** Stessa geometria della pagina: sottotitolo, controllo vista, card "copertina". */
export default function Loading() {
  return (
    <>
      <TopBar title="Cinema" action={<Skeleton className="h-9 w-36 rounded-full" />} />
      <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <Skeleton className="-mt-2 h-4 w-40 rounded-md" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-[38px] w-[196px] rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid gap-3 lg:grid-cols-3 lg:gap-6">
          <Skeleton className="aspect-[350/292] w-full rounded-[20px]" />
          <Skeleton className="aspect-[350/292] w-full rounded-[20px]" />
          <Skeleton className="hidden aspect-[350/292] w-full rounded-[20px] lg:block" />
        </div>
      </main>
    </>
  );
}
