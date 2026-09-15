import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { Skeleton } from "@/components/ui/Skeleton";
import { getContinueItems, type ContinueItem } from "@/lib/watch/continue";
import { getWatchedPlatforms } from "@/lib/watch/platforms";
import { getLiveSessions } from "@/lib/watch/live";
import { tvCollegate } from "@/lib/devices/queries";
import type { EntryWithTitle } from "@/lib/watch/queries";
import {
  HOME_SCOPE_VUOTO,
  scopeVuoto,
  soloGenere,
  type HomeScope,
} from "@/lib/home/scope";
import { filtraScope } from "@/lib/home/scope-filter";
import { offreLaPiattaforma } from "@/lib/platforms/filter";
import { createClient } from "@/lib/supabase/server";
import { ContinueCard } from "./ContinueCard";
import { HomeTypeGate, type HomeTab } from "./HomeType";

interface Tv {
  id: string;
  name: string;
}

function Row({ items, type, tv }: { items: ContinueItem[]; type: HomeTab; tv: Tv[] }) {
  const mine = type === "all" ? items : items.filter((item) => item.mediaType === type);
  if (mine.length === 0) return null;
  return (
    <HomeTypeGate type={type}>
      <HorizontalShelf title="Continua a guardare" seeAllHref="/library?status=watching">
        {mine.map((item) => (
          <ContinueCard key={item.entryId} item={item} tv={tv} />
        ))}
      </HorizontalShelf>
    </HomeTypeGate>
  );
}

/**
 * Nella home filtrata restano le tessere dell'ambito: la piattaforma è quella su cui
 * l'utente guarda davvero (`providerId` della tessera, che viene dalla sessione o
 * dall'offerta), il genere si legge dal titolo in cache.
 */
async function nelloScope(
  items: ContinueItem[],
  scope: HomeScope,
): Promise<ContinueItem[]> {
  if (scopeVuoto(scope)) return items;
  const suPiattaforma =
    scope.platforms.length > 0
      ? items.filter(
          (i) =>
            i.providerId !== null && offreLaPiattaforma([i.providerId], scope.platforms),
        )
      : items;
  if (!scope.genre) return suPiattaforma;
  const db = await createClient();
  return filtraScope(
    db,
    suPiattaforma.map((i) => ({ id: i.titleId, mediaType: i.mediaType, item: i })),
    soloGenere(scope),
  ).then((tenuti) => tenuti.map((t) => t.item));
}

/**
 * Prima fila della home: cosa l'utente sta guardando e deve riprendere.
 * Sta dietro un Suspense perché legge da TMDB il fotogramma dell'episodio
 * successivo (una `getSeason` per serie), il resto della pagina non l'aspetta.
 * Le tre file (film, serie e la mista di "Tutto") sono rese tutte: la scheda scelta
 * in testata decide quale si vede, senza tornare al server.
 */
export async function ContinueRow({
  entries,
  scope = HOME_SCOPE_VUOTO,
}: {
  entries: EntryWithTitle[];
  scope?: HomeScope;
}) {
  // Cosa i dispositivi collegati stanno riproducendo adesso: decide quale
  // episodio la tessera mostra e da quale minuto riparte. Una query sola.
  // TV collegate: una sola query per la fila, non una per tessera.
  const [live, platforms, tv] = await Promise.all([
    getLiveSessions(),
    getWatchedPlatforms(entries),
    tvCollegate(),
  ]);
  const tutti = await getContinueItems(entries, live, platforms);
  const items = await nelloScope(tutti, scope);
  if (items.length === 0) return null;
  return (
    <>
      <Row items={items} type="all" tv={tv} />
      <Row items={items} type="movie" tv={tv} />
      <Row items={items} type="tv" tv={tv} />
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
          <div key={i} className="w-[280px] shrink-0 lg:w-[380px]">
            <Skeleton className="aspect-video w-full rounded-[14px]" />
            <Skeleton className="mt-2 h-4 w-3/4 rounded" />
            <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
