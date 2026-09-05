import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Cinema" />
      <main className="flex flex-col gap-3 px-5 pb-16 lg:px-10">
        <Skeleton className="h-10 w-72 rounded-full" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
      </main>
    </>
  );
}
