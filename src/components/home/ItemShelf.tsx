import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import {
  PosterCard,
  SHELF_CARD_CLASS,
  SHELF_CARD_SIZES,
} from "@/components/ui/PosterCard";
import type { ShelfItem } from "@/lib/home/shelves-rank";

/**
 * Scaffale di copertine della home: la forma comune a "Perché hai visto",
 * "Per te", "Da vedere" e "I più amati". Le copertine si dichiarano al
 * `PreviewLayer` (anteprima col trailer al passaggio del mouse su desktop).
 * Uno scaffale vuoto non si rende: le sezioni della home spariscono da sole.
 */
export function ItemShelf({
  title,
  items,
  seeAllHref,
}: {
  title: string;
  items: ShelfItem[];
  seeAllHref?: string;
}) {
  if (items.length === 0) return null;
  return (
    <HorizontalShelf title={title} seeAllHref={seeAllHref}>
      {items.map((item) => (
        <PosterCard
          key={`${item.mediaType}-${item.id}`}
          className={SHELF_CARD_CLASS}
          sizes={SHELF_CARD_SIZES}
          title={item.title}
          posterPath={item.posterPath}
          year={item.year}
          href={`/title/${item.mediaType}/${item.id}`}
          preview
        />
      ))}
    </HorizontalShelf>
  );
}
