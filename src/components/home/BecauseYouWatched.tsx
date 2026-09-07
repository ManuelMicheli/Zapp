import { getBecauseShelf, getBecauseTaste } from "@/lib/home/shelves";
import { BECAUSE_SOURCES, pickBecauseSources } from "@/lib/home/shelves-rank";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { BecauseShelf, type BecauseVariant } from "./BecauseShelf";
import { HomeTypeGate, type HomeTab } from "./HomeType";

const TABS: HomeTab[] = ["all", "movie", "tv"];

/**
 * Quante sorgenti si provano per trovarne cinque buone. Un titolo senza filone
 * leggibile produce una lista corta: invece di controllarlo prima (che vorrebbe dire
 * rileggere `titles.raw` per ognuno) si guarda il risultato e si scarta lì.
 */
const CANDIDATE_SOURCES = 8;
/** Sotto questa misura lo scaffale non vale una pillola. */
const MIN_ITEMS = 6;

/**
 * "Perché hai visto X": i titoli dello **stesso filone** di uno degli ultimi che hai
 * finito — non più la lista che TMDB accosta a quel titolo, ma la classifica di
 * `src/lib/similar/`, ri-ordinata sul gusto di chi guarda (registi e temi che
 * ricorrono in ciò che ha finito) e senza ciò che ha già in libreria.
 *
 * Una variante per scheda — sotto "Film" si parte dai film, sotto "Serie TV" dalle
 * serie —, tutte rese dal server: cambiare scheda non torna indietro, e dentro ogni
 * scheda le pillole cambiano titolo di partenza senza chiedere niente (le liste sono
 * già qui). Le entry sono quelle già lette dalla home (`getHomeData`): nessuna query
 * in più, e la classifica di ogni titolo è condivisa fra tutti gli utenti.
 */
export async function BecauseYouWatched({ watched }: { watched: EntryWithTitle[] }) {
  const shelves = await Promise.all(
    TABS.map(async (tab) => {
      const sources = pickBecauseSources(watched, tab, CANDIDATE_SOURCES);
      const taste = await getBecauseTaste(sources);
      const variants = await Promise.all(
        sources.map(async (source) => ({
          source,
          items: await getBecauseShelf(
            source.mediaType,
            source.titleId,
            taste,
            source.rating,
          ),
        })),
      );
      return {
        tab,
        variants: variants
          .filter((v) => v.items.length >= MIN_ITEMS)
          .slice(0, BECAUSE_SOURCES) as BecauseVariant[],
      };
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
