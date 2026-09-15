import { getTopRatedOnZapp, type ChartItem } from "@/lib/charts/queries";
import { mixShelf } from "@/lib/home/shelves";
import { HOME_SCOPE_VUOTO, type HomeScope } from "@/lib/home/scope";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * "Grandi classici da recuperare": i titoli col miglior ZappScore che l'utente **non
 * ha** in libreria, ruotati per utente e per giorno (vedi `getTopRatedOnZapp`).
 *
 * Si chiamava "I meglio votati su Zapp" e mostrava i venti col punteggio più alto,
 * uguali per tutti e comprensivi di quello che l'utente aveva già visto: per chi usa
 * Zapp davvero era la fila più inutile della home. Il nome nuovo dice due cose vere
 * insieme — da dove viene l'ordine (lo ZappScore della fase B) e perché quei titoli
 * sono lì (non li hai) — che è quello che una testata di scaffale deve fare.
 *
 * Il filtro `confidence: high` è già nella query: qui non arrivano titoli con due voti
 * in croce.
 */

function toShelf(items: ChartItem[]): ShelfItem[] {
  // La query scarta già i titoli senza locandina, ma `ChartItem.posterPath` resta
  // nullabile per costruzione: il tipo va rispettato, non forzato con un cast.
  return items
    .filter((i): i is ChartItem & { posterPath: string } => Boolean(i.posterPath))
    .map((i) => ({
      id: i.id,
      mediaType: i.mediaType,
      title: i.title,
      posterPath: i.posterPath,
      year: i.year,
      rating: i.score,
    }));
}

export async function TopRatedShelves({
  scope = HOME_SCOPE_VUOTO,
}: {
  scope?: HomeScope;
}) {
  const [movie, tv] = await Promise.all([
    getTopRatedOnZapp("movie", scope).catch(() => []),
    getTopRatedOnZapp("tv", scope).catch(() => []),
  ]);
  const film = toShelf(movie);
  const serie = toShelf(tv);
  if (film.length === 0 && serie.length === 0) return null;

  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf
          title="Grandi classici da recuperare"
          items={mixShelf(film, serie)}
          surface="home-amati"
        />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf title="Film da recuperare" items={film} surface="home-amati" />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf title="Serie da recuperare" items={serie} surface="home-amati" />
      </HomeTypeGate>
    </>
  );
}
