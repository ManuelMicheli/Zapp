import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { Skeleton } from "@/components/ui/Skeleton";
import { getContinueItems } from "@/lib/watch/continue";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { ContinueCard } from "./ContinueCard";

/**
 * Prima fila della home: cosa l'utente sta guardando e deve riprendere.
 * Sta dietro un Suspense perché legge da TMDB il fotogramma dell'episodio
 * successivo (una `getSeason` per serie), il resto della pagina non l'aspetta.
 */
export async function ContinueRow({ entries }: { entries: EntryWithTitle[] }) {
  const items = await getContinueItems(entries);
  if (items.length === 0) return null;
  return (
    <HorizontalShelf title="Continua a guardare" seeAllHref="/library?status=watching">
      {items.map((item) => (
        <ContinueCard key={item.entryId} item={item} />
      ))}
    </HorizontalShelf>
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
