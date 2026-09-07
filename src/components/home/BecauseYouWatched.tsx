import { getBecauseShelf } from "@/lib/home/shelves";
import { pickBecauseSources } from "@/lib/home/shelves-rank";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { BecauseShelf } from "./BecauseShelf";
import { HomeTypeGate, type HomeTab } from "./HomeType";

const TABS: HomeTab[] = ["all", "movie", "tv"];

/**
 * "Perché hai visto X": i titoli che TMDB accosta a uno degli ultimi cinque che hai
 * finito. Una variante per scheda — sotto "Film" si parte dai film, sotto "Serie TV"
 * dalle serie —, tutte rese dal server: cambiare scheda non torna indietro. Dentro
 * ogni scheda le pillole cambiano titolo di partenza, anche quelle senza tornare al
 * server (le liste sono già qui). Le entry sono quelle già lette dalla home
 * (`getHomeData`): nessuna query in più, solo una `getBecauseShelf` per titolo —
 * `cache()` sulla funzione e cache TMDB di un giorno, e le sorgenti di "Tutto" sono
 * le stesse delle altre due schede.
 */
export async function BecauseYouWatched({ watched }: { watched: EntryWithTitle[] }) {
  const shelves = await Promise.all(
    TABS.map(async (tab) => {
      const sources = pickBecauseSources(watched, tab);
      const variants = await Promise.all(
        sources.map(async (source) => ({
          source,
          items: await getBecauseShelf(source.mediaType, source.titleId),
        })),
      );
      return { tab, variants: variants.filter((v) => v.items.length > 0) };
    }),
  );

  return (
    <>
      {shelves.map(({ tab, variants }) =>
        variants.length > 0 ? (
          <HomeTypeGate key={tab} type={tab}>
            <BecauseShelf variants={variants} />
          </HomeTypeGate>
        ) : null,
      )}
    </>
  );
}
