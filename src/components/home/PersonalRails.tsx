import { getRails, getRankedForYou } from "@/lib/rank/engine";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { RankedItem } from "@/lib/rank/types";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * Gli scaffali che nascono dal profilo (fase D): "Ancora con Pedro Pascal", "Perché ami
 * la fantascienza", "Il meglio degli anni 2000".
 *
 * Uno scaffale che dice **perché esiste** si scorre; uno che dice "Per te" e basta si
 * salta. I titoli sono gli stessi candidati di "Per te", esclusi quelli già mostrati lì:
 * lo stesso film in due file della stessa home è un errore che si vede subito.
 *
 * Con un profilo debole non compare nessun rail e la home resta quella di prima:
 * è voluto, e vale più di tre file riempite a caso.
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

function chiavi(items: RankedItem[]): string[] {
  return items.map((i) => `${i.mediaType}-${i.id}`);
}

export async function PersonalRails() {
  // Cosa "Per te" ha già mostrato: `getRankedForYou` è in `cache()`, quindi qui non
  // costa una seconda esecuzione del motore.
  const [perTeFilm, perTeSerie] = await Promise.all([
    getRankedForYou("movie").catch(() => []),
    getRankedForYou("tv").catch(() => []),
  ]);
  const gia = new Set([...chiavi(perTeFilm), ...chiavi(perTeSerie)]);

  const [film, serie] = await Promise.all([
    getRails("movie", gia).catch(() => []),
    getRails("tv", gia).catch(() => []),
  ]);
  if (film.length === 0 && serie.length === 0) return null;

  const perChiave = new Map(film.map((r) => [r.key, r]));

  return (
    <>
      <HomeTypeGate type="all">
        {film.map((r) => {
          const gemello = serie.find((s) => s.key === r.key);
          return (
            <ItemShelf
              key={r.key}
              title={r.titolo}
              items={mixShelf(toShelf(r.items), toShelf(gemello?.items ?? []))}
              surface="home-consigli"
            />
          );
        })}
        {serie
          .filter((s) => !perChiave.has(s.key))
          .map((s) => (
            <ItemShelf
              key={s.key}
              title={s.titolo}
              items={toShelf(s.items)}
              surface="home-consigli"
            />
          ))}
      </HomeTypeGate>

      <HomeTypeGate type="movie">
        {film.map((r) => (
          <ItemShelf
            key={r.key}
            title={r.titolo}
            items={toShelf(r.items)}
            surface="home-consigli"
          />
        ))}
      </HomeTypeGate>

      <HomeTypeGate type="tv">
        {serie.map((r) => (
          <ItemShelf
            key={r.key}
            title={r.titolo}
            items={toShelf(r.items)}
            surface="home-consigli"
          />
        ))}
      </HomeTypeGate>
    </>
  );
}
