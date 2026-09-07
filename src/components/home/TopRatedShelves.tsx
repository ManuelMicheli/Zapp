import { getTopRatedOnZapp, type ChartItem } from "@/lib/charts/queries";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * "I meglio votati su Zapp": la classifica per ZappScore della fase B, non più la
 * lista TMDB per media voto.
 *
 * Il nome dice **da dove viene il numero**, come per "Top 10 su Netflix in Italia": in
 * home nessuno scaffale deve lasciare l'utente a indovinare chi ha deciso quell'ordine.
 * "I più amati di sempre" non lo diceva, e per giunta prometteva "di sempre" mostrando
 * la classifica TMDB del momento.
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

export async function TopRatedShelves() {
  const [movie, tv] = await Promise.all([
    getTopRatedOnZapp("movie").catch(() => []),
    getTopRatedOnZapp("tv").catch(() => []),
  ]);
  const film = toShelf(movie);
  const serie = toShelf(tv);
  if (film.length === 0 && serie.length === 0) return null;

  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf
          title="I meglio votati su Zapp"
          items={mixShelf(film, serie)}
          surface="home-amati"
        />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf
          title="I film meglio votati su Zapp"
          items={film}
          surface="home-amati"
        />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf
          title="Le serie meglio votate su Zapp"
          items={serie}
          surface="home-amati"
        />
      </HomeTypeGate>
    </>
  );
}
