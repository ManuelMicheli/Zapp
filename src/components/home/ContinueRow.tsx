import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { Skeleton } from "@/components/ui/Skeleton";
import { getContinueItems, type ContinueItem } from "@/lib/watch/continue";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { ContinueCard } from "./ContinueCard";
import { HomeTypeGate, type HomeTab } from "./HomeType";

function Row({ items, type }: { items: ContinueItem[]; type: HomeTab }) {
  const mine = type === "all" ? items : items.filter((item) => item.mediaType === type);
  if (mine.length === 0) return null;
  return (
    <HomeTypeGate type={type}>
      <HorizontalShelf title="Continua a guardare" seeAllHref="/library?status=watching">
        {mine.map((item) => (
          <ContinueCard key={item.entryId} item={item} />
        ))}
      </HorizontalShelf>
    </HomeTypeGate>
  );
}

/**
 * Prima fila della home: cosa l'utente sta guardando e deve riprendere.
 * Sta dietro un Suspense perché legge da TMDB il fotogramma dell'episodio
 * successivo (una `getSeason` per serie), il resto della pagina non l'aspetta.
 * Le tre file (film, serie e la mista di "Tutto") sono rese tutte: la scheda scelta
 * in testata decide quale si vede, senza tornare al server.
 */
export async function ContinueRow({ entries }: { entries: EntryWithTitle[] }) {
  const items = await getContinueItems(entries);
  if (items.length === 0) return null;
  return (
    <>
      <Row items={items} type="all" />
      <Row items={items} type="movie" />
      <Row items={items} type="tv" />
    </>
  );
}

/** Stessa geometria della fila vera: nessuno scatto quando arrivano i fotogrammi. */
export function ContinueRowSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        <Skeleton className="h-6 w-[190px] rounded-lg" />
      </div>
      <div className="flex gap-3 overflow-hidden px-5 pb-1 lg:px-10">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="w-[240px] shrink-0 lg:w-[300px]">
            <Skeleton className="aspect-video w-full rounded-[14px]" />
            <Skeleton className="mt-2 h-4 w-3/4 rounded" />
            <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
