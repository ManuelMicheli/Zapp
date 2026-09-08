import { Suspense } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { MomentShelf } from "@/components/home/MomentShelf";
import { SearchClient } from "./SearchClient";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";

export const metadata = { title: "Cerca" };

export default function SearchPage() {
  return (
    <>
      <TopBar title="Cerca" />
      <main className="px-5 pb-16 lg:px-10">
        {/* In cima a Cerca: la fila che sa che ore sono, che giorno e' e se piove, con
          le pillole del mood. Sta qui e non in home perche' e' una fila per chi sta
          cercando cosa guardare, non per chi riprende quello che aveva lasciato.
          `conSchede={false}`: fuori dalla home non c'e' `HomeTypeProvider`, e il gate
          senza provider lascerebbe passare tutte e tre le varianti. */}
        <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
          <div className="-mx-5 mb-8 lg:-mx-10">
            <MomentShelf conSchede={false} />
          </div>
        </Suspense>

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
