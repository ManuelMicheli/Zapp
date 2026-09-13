import { Suspense } from "react";
import { MomentShelf, MomentShelfSkeleton } from "@/components/home/MomentShelf";
import { SearchClient } from "./SearchClient";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { DiscoverSkeleton } from "@/components/discover/DiscoverSkeleton";
import { getRecentSearches } from "@/lib/search/queries";

export const metadata = { title: "Cerca" };

/** Oltre questo non e' piu' una query digitata o detta a voce (vedi devices/intent). */
const MAX_QUERY = 200;

export default async function SearchPage({
  searchParams,
}: {
  // `/search?q=<testo>`: l'intent "Apri un titolo su Zapp" ci arriva da un deep
  // link (`zapp://search?q=…`, vedi mobile.md), non da un tocco sulla barra.
  searchParams: Promise<{ q?: string }>;
}) {
  // una query sola, e serve gia' al primo tocco della barra: non sta dietro un
  // Suspense, altrimenti il pannello comparirebbe vuoto e poi si riempirebbe
  const recent = await getRecentSearches();
  const { q } = await searchParams;
  const initialQuery =
    typeof q === "string" && q.trim().length > 0 ? q.trim().slice(0, MAX_QUERY) : "";

  return (
    <>
      {/* Niente titolo "Cerca": la pagina comincia con la barra, che dice gia' cos'e'
        (e la voce attiva della nav lo ripete). Con l'h1 sopra restava una fascia nera
        vuota fra le due. Niente padding in cima nemmeno adesso: il banner del momento
        comincia a filo pagina e la barra gli sta sopra in trasparenza (richiesta
        utente 2026-09-12). */}
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
          recent={recent}
          initialQuery={initialQuery}
          discover={
            <>
              <div className="mb-8">
                <Suspense fallback={<MomentShelfSkeleton />}>
                  <MomentShelf conSchede={false} />
                </Suspense>
              </div>
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
