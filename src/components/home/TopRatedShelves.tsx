import { getTopRatedShelves } from "@/lib/home/shelves";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * "I più amati di sempre": oggi la lista TMDB per media voto con molti voti; la
 * fase B (catalogo e ZappScore) la sostituirà con la classifica di Zapp senza
 * toccare questo componente.
 */
export async function TopRatedShelves() {
  const { movie, tv, all } = await getTopRatedShelves();
  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf title="I più amati di sempre" items={all} />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf title="I film più amati di sempre" items={movie} />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf title="Le serie più amate di sempre" items={tv} />
      </HomeTypeGate>
    </>
  );
}
