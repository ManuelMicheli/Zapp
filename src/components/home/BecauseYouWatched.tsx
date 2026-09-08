import { getBecauseShelf, getOwnedKeys } from "@/lib/home/shelves";
import { BECAUSE_SOURCES, pickBecauseSources } from "@/lib/home/shelves-rank";
import { personalizeSimilar } from "@/lib/similar/personal";
import { withScores } from "@/lib/ratings/cards";
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
 * `src/lib/similar/`, ri-ordinata con l'**affinità della fase C** sul profilo di gusto
 * della fase A (l'unico dell'app) e senza ciò che ha già in libreria.
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
      const [liste, owned] = await Promise.all([
        Promise.all(
          sources.map((source) => getBecauseShelf(source.mediaType, source.titleId)),
        ),
        getOwnedKeys(),
      ]);
      // Il gusto si applica a tutti gli scaffali insieme: una passata sola.
      const personali = await personalizeSimilar(liste, owned);
      // Lo stesso vale per lo ZappScore: una lettura sola per tutte le pillole,
      // non una per variante (le liste sono già tutte qui).
      const conVoto = await withScores(personali.flat());
      const perChiave = new Map(conVoto.map((i) => [`${i.mediaType}-${i.id}`, i]));
      const variants = sources.map((source, i) => ({
        source,
        items: (personali[i] ?? []).flatMap((item) => {
          const conVoto = perChiave.get(`${item.mediaType}-${item.id}`);
          return conVoto ? [conVoto] : [];
        }),
      }));
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
