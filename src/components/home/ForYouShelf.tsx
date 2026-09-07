import { getRankedForYou } from "@/lib/rank/engine";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { RankedItem } from "@/lib/rank/types";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * "Per te": la lista del motore di ranking (fase C), non più il genere che guardi di
 * più passato a `discover`.
 *
 * Ogni copertina porta l'affinità personale ("per te 92%") e il motivo per cui è lì.
 * L'affinità compare solo quando il profilo della fase A ha abbastanza massa da
 * giustificarla: al secondo giorno di un utente nuovo la percentuale non si vede e
 * l'ordine resta quello pubblico della fase B. Un numero inventato costa più fiducia
 * di quanta ne guadagni un consiglio azzeccato.
 */

function toShelf(items: RankedItem[]): ShelfItem[] {
  return items.map((i) => ({
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    posterPath: i.posterPath,
    year: i.year,
    rating: i.zappScore ?? i.voteAverage,
    affinity: i.percentuale,
    reason: i.motivo,
  }));
}

export async function ForYouShelf() {
  const [movie, tv] = await Promise.all([
    getRankedForYou("movie").catch(() => []),
    getRankedForYou("tv").catch(() => []),
  ]);
  const film = toShelf(movie);
  const serie = toShelf(tv);
  if (film.length === 0 && serie.length === 0) return null;

  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf title="Per te" items={mixShelf(film, serie)} surface="home-consigli" />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf title="Per te" items={film} surface="home-consigli" />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf title="Per te" items={serie} surface="home-consigli" />
      </HomeTypeGate>
    </>
  );
}
