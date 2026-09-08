import { Suspense } from "react";
import { MomentShelf } from "@/components/home/MomentShelf";
import { SearchClient } from "./SearchClient";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";

export const metadata = { title: "Cerca" };

export default function SearchPage() {
  return (
    <>
      {/* Niente titolo "Cerca": la pagina comincia con la barra, che dice gia' cos'e'
        (e la voce attiva della nav lo ripete). Con l'h1 sopra restava una fascia nera
        vuota fra le due. */}
      <main className="px-5 pb-16 lg:px-10">
        {/* La barra di ricerca sta in cima e al centro (scelta utente 2026-09-08):
          quello che c'e' sotto — la fila del momento e gli scaffali di Scopri — e'
          quello che si guarda quando non si sta ancora cercando niente, quindi passa
          nello slot `discover` di `SearchClient` e sparisce appena si digita.
          La fila del momento sa che ore sono, che giorno e' e se piove; sta qui e non
          in home perche' e' una fila per chi sta cercando cosa guardare, non per chi
          riprende quello che aveva lasciato. `conSchede={false}`: fuori dalla home non
          c'e' `HomeTypeProvider`, e il gate senza provider lascerebbe passare tutte e
          tre le varianti. */}
        <SearchClient
          discover={
            <>
              <Suspense fallback={<DiscoverSkeleton shelves={1} />}>
                <div className="mb-8">
                  <MomentShelf conSchede={false} />
                </div>
              </Suspense>
              <Suspense fallback={<DiscoverSkeleton />}>
                <DiscoverSections />
              </Suspense>
            </>
          }
        />
      </main>
    </>
  );
}
