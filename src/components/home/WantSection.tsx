import { getPlatformShelves, mixShelf } from "@/lib/home/shelves";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { WantShelf, type WantShelfPlatform } from "./WantShelf";

function toItems(entries: EntryWithTitle[], type: "movie" | "tv"): ShelfItem[] {
  return entries
    .filter((e) => e.media_type === type && e.title?.poster_path)
    .map((e) => ({
      id: e.title_id,
      mediaType: type,
      title: e.title?.title ?? "",
      posterPath: e.title!.poster_path as string,
      year: e.title?.release_date?.slice(0, 4) ?? null,
    }));
}

/**
 * Parte server di "Da vedere": la lista dell'utente (già letta da `getHomeData`) e
 * le novità delle piattaforme, divise per tipo. Le pillole le gestisce `WantShelf`,
 * che è client solo per il cambio di lista.
 */
export async function WantSection({ want }: { want: EntryWithTitle[] }) {
  const platforms = await getPlatformShelves();
  const movie = toItems(want, "movie");
  const tv = toItems(want, "tv");

  const shelves: WantShelfPlatform[] = platforms.map((p) => ({
    id: p.id,
    name: p.name,
    logo: p.logo,
    items: { movie: p.movie, tv: p.tv, all: mixShelf(p.movie, p.tv) },
  }));

  if (movie.length === 0 && tv.length === 0 && shelves.length === 0) return null;

  return <WantShelf list={{ movie, tv, all: mixShelf(movie, tv) }} platforms={shelves} />;
}
