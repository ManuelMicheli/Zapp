import type { ReactNode } from "react";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import {
  PosterCard,
  SHELF_CARD_CLASS,
  SHELF_CARD_SIZES,
} from "@/components/ui/PosterCard";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import { withScores } from "@/lib/ratings/cards";
import type { Surface } from "@/lib/taste/surfaces";

/**
 * Scaffale di copertine della home: la forma comune a "Perché hai visto",
 * "Per te", "Da vedere" e "I più amati". Le copertine si dichiarano al
 * `PreviewLayer` (anteprima col trailer al passaggio del mouse su desktop).
 * Uno scaffale vuoto non si rende: le sezioni della home spariscono da sole.
 *
 * È qui che lo ZappScore entra in tutti gli scaffali della home in una volta sola:
 * una lettura di `title_ratings` per scaffale (`withScores`), mai una per copertina.
 * Chi passa già un `rating` (il motore di ranking) lo vede sostituito dallo
 * ZappScore quando esiste, e tenuto quando il catalogo non l'ha ancora calcolato.
 */
export async function ItemShelf({
  title,
  items,
  seeAllHref,
  surface,
  eyebrow,
  aside,
}: {
  title: string;
  items: ShelfItem[];
  seeAllHref?: string;
  /** Superficie dichiarata alla raccolta dei segnali (fase A). */
  surface: Surface;
  /** Riga piccola sopra il titolo. */
  eyebrow?: string;
  /** Riga sotto il titolo: le pillole del mood della fila del momento. */
  aside?: ReactNode;
}) {
  if (items.length === 0) return null;
  const scored = await withScores(items);
  return (
    <HorizontalShelf
      title={title}
      seeAllHref={seeAllHref}
      eyebrow={eyebrow}
      aside={aside}
    >
      {scored.map((item, i) => (
        <PosterCard
          key={`${item.mediaType}-${item.id}`}
          className={SHELF_CARD_CLASS}
          sizes={SHELF_CARD_SIZES}
          title={item.title}
          posterPath={item.posterPath}
          year={item.year}
          href={`/title/${item.mediaType}/${item.id}`}
          rating={item.zappScore ?? item.rating ?? undefined}
          votes={item.zappVotes}
          affinity={item.affinity ?? null}
          reason={item.reason ?? null}
          preview
          signal={{ surface, position: i }}
        />
      ))}
    </HorizontalShelf>
  );
}
