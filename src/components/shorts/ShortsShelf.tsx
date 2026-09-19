import { HomeTypeGate } from "@/components/home/HomeType";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { SHORT_FILMS } from "@/lib/shorts/catalog";
import { getStatoCorti } from "@/lib/shorts/queries";
import { ShortCard } from "./ShortCard";

/**
 * Lo scaffale dei corti in home. Sta sotto il cancello "Film" come le saghe: un
 * cortometraggio e' un film, e chi ha messo la home su "Serie TV" non vuole vederlo.
 *
 * Mostra i primi dodici del catalogo (i piu' visti) e non una selezione furba: la
 * pagina `/corti` e' a un tocco, e una fila in home serve a far capire che la
 * sezione esiste, non a sostituirla.
 */
export async function ShortsShelf() {
  const stato = await getStatoCorti();
  return (
    <HomeTypeGate type={["all", "movie"]}>
      <HorizontalShelf title="Corti" seeAllHref="/corti">
        {SHORT_FILMS.slice(0, 12).map((corto) => (
          <ShortCard
            key={corto.slug}
            corto={corto}
            shelf
            visto={Boolean(stato.get(corto.youtubeId)?.vistoIl)}
            preferito={Boolean(stato.get(corto.youtubeId)?.preferito)}
          />
        ))}
      </HorizontalShelf>
    </HomeTypeGate>
  );
}
