import { getHomeRails } from "@/lib/rank/engine";
import { mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { Dimensione, RankedItem } from "@/lib/rank/types";
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
 * `dimensioni` sceglie quali rail rendere qui: la home ne mette una parte sopra
 * "Perché hai visto X" e il resto sotto (richiesta utente 2026-09-08). I dati sono gli
 * stessi per tutti — `getHomeRails` è in `cache()` per richiesta — quindi due istanze
 * non costano una seconda esecuzione del motore, e la scelta dei titoli (che non si
 * ripetono fra un rail e l'altro) resta quella dell'ordine originale.
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

export async function PersonalRails({ dimensioni }: { dimensioni: Dimensione[] }) {
  const [tuttiFilm, tutteSerie] = await Promise.all([
    getHomeRails("movie"),
    getHomeRails("tv"),
  ]);
  const tieni = (d: Dimensione) => dimensioni.includes(d);
  const film = tuttiFilm.filter((r) => tieni(r.dimensione));
  const serie = tutteSerie.filter((r) => tieni(r.dimensione));
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
