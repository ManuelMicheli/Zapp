import { Suspense } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { SearchClient } from "./SearchClient";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata = { title: "Cerca" };

function DiscoverSkeleton() {
  return (
    <div className="space-y-8 pt-2">
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s}>
          <Skeleton className="mx-4 mb-3 h-5 w-48 rounded" />
          <div className="flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-28 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SearchPage() {
  return (
    <>
      <TopBar title="Cerca" />
      <main className="px-4 pb-36 lg:px-10">
        <SearchClient
          discover={
            <Suspense fallback={<DiscoverSkeleton />}>
              <DiscoverSections />
            </Suspense>
          }
        />
      </main>
    </>
  );
}
