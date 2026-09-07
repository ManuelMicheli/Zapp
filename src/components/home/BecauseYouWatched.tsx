import { getBecauseShelf } from "@/lib/home/shelves";
import { pickBecauseSource } from "@/lib/home/shelves-rank";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { HomeTypeGate, type HomeTab } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

const TABS: HomeTab[] = ["all", "movie", "tv"];

/**
 * "Perché hai visto X": i titoli che TMDB accosta all'ultimo che hai finito.
 * Una variante per scheda — sotto "Film" parte dall'ultimo film, sotto "Serie TV"
 * dall'ultima serie —, tutte rese dal server: cambiare scheda non torna indietro.
 * Le entry sono quelle già lette dalla home (`getHomeData`): nessuna query in più.
 */
export async function BecauseYouWatched({ watched }: { watched: EntryWithTitle[] }) {
  const shelves = await Promise.all(
    TABS.map(async (tab) => {
      const source = pickBecauseSource(watched, tab);
      if (!source) return null;
      const items = await getBecauseShelf(source.mediaType, source.titleId);
      return { tab, source, items };
    }),
  );

  return (
    <>
      {shelves.map((shelf) =>
        shelf && shelf.items.length > 0 ? (
          <HomeTypeGate key={shelf.tab} type={shelf.tab}>
            <ItemShelf
              title={`Perché hai visto ${shelf.source.name}`}
              items={shelf.items}
            />
          </HomeTypeGate>
        ) : null,
      )}
    </>
  );
}
