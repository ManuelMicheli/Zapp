import { Suspense } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { SearchClient } from "./SearchClient";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";

export const metadata = { title: "Cerca" };

export default function SearchPage() {
  return (
    <>
      <TopBar title="Cerca" />
      <main className="px-5 pb-36 lg:px-10">
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
