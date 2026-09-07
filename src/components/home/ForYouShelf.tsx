import { getForYouShelf, mixShelf } from "@/lib/home/shelves";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * "Per te: <Genere>": il genere che guardi di più, uno solo e a rotazione
 * giornaliera fra i tuoi. Le liste per genere sono quelle già chieste dal carosello
 * (cache Next 1 h), quindi lo scaffale di solito non costa una chiamata in più.
 * Sotto "Tutto" film e serie del genere si alternano, col nome del genere dei film.
 */
export async function ForYouShelf() {
  const [movie, tv] = await Promise.all([getForYouShelf("movie"), getForYouShelf("tv")]);
  if (!movie && !tv) return null;
  const allItems = mixShelf(movie?.items ?? [], tv?.items ?? []);
  const allName = movie?.genreName ?? tv?.genreName;

  return (
    <>
      {allName && (
        <HomeTypeGate type="all">
          <ItemShelf
            title={`Per te: ${allName}`}
            items={allItems}
            surface="home-consigli"
          />
        </HomeTypeGate>
      )}
      {movie && (
        <HomeTypeGate type="movie">
          <ItemShelf
            title={`Per te: ${movie.genreName}`}
            items={movie.items}
            surface="home-consigli"
          />
        </HomeTypeGate>
      )}
      {tv && (
        <HomeTypeGate type="tv">
          <ItemShelf
            title={`Per te: ${tv.genreName}`}
            items={tv.items}
            surface="home-consigli"
          />
        </HomeTypeGate>
      )}
    </>
  );
}
