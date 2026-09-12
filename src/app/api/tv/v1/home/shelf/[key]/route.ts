import type { NextRequest } from "next/server";
import {
  getBecauseShelf,
  getComingSoon,
  getOwnedKeys,
  getPlatformShelves,
  mixShelf,
} from "@/lib/home/shelves";
import { getHomeRails, getRankedForYou } from "@/lib/rank/engine";
import { getProviderChart, getTopRatedOnZapp } from "@/lib/charts/queries";
import { personalizeSimilar } from "@/lib/similar/personal";
import { withScores } from "@/lib/ratings/cards";
import { getHomeData } from "@/lib/watch/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { TitleCard } from "@/lib/tv/dto";
import {
  cardFromChart,
  cardFromEntry,
  cardFromRanked,
  cardFromShelf,
  cardFromSimilar,
} from "@/lib/tv/map";
import { parseShelfKey, type ShelfKey } from "@/lib/tv/shelf-key";

async function items(k: ShelfKey): Promise<TitleCard[]> {
  switch (k.kind) {
    case "foryou": {
      const [movie, tv] = await Promise.all([
        getRankedForYou("movie").catch(() => []),
        getRankedForYou("tv").catch(() => []),
      ]);
      return mixShelf(movie.map(cardFromRanked), tv.map(cardFromRanked));
    }
    case "rail": {
      const [film, serie] = await Promise.all([
        getHomeRails("movie"),
        getHomeRails("tv"),
      ]);
      const f = film.find((r) => r.key === k.key)?.items ?? [];
      const s = serie.find((r) => r.key === k.key)?.items ?? [];
      return mixShelf(f.map(cardFromRanked), s.map(cardFromRanked));
    }
    case "because": {
      const [lista, owned] = await Promise.all([
        getBecauseShelf(k.mediaType, k.titleId),
        getOwnedKeys(),
      ]);
      const [personale] = await personalizeSimilar([lista], owned);
      // `withScores` attacca gia' `zappScore`/`zappVotes` veri: la tessera che ne esce
      // e' una `TitleCard` completa, senza bisogno di rimappare campi.
      return withScores(personale.map(cardFromSimilar));
    }
    case "topten":
      return (await getProviderChart(8).catch(() => [])).map(cardFromChart);
    case "want": {
      const { want } = await getHomeData();
      return want.map(cardFromEntry);
    }
    case "platform": {
      const shelf = (await getPlatformShelves()).find((p) => p.id === k.providerId);
      if (!shelf) return [];
      const conVoto = await withScores(
        mixShelf(shelf.movie, shelf.tv).map(cardFromShelf),
      );
      // Lo scaffale e' filtrato per piattaforma: la pillola del provider e' certa,
      // anche se la cache di `title_providers` non l'ha ancora vista.
      return conVoto.map((c) => ({ ...c, providerIds: [k.providerId] }));
    }
    case "toprated": {
      const [movie, tv] = await Promise.all([
        getTopRatedOnZapp("movie").catch(() => []),
        getTopRatedOnZapp("tv").catch(() => []),
      ]);
      return mixShelf(movie.map(cardFromChart), tv.map(cardFromChart));
    }
    case "comingsoon":
      return (await getComingSoon()).map(cardFromShelf);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const parsed = parseShelfKey(key);
  if (!parsed) return tvJson({ error: "Scaffale sconosciuto" }, { status: 404 });
  return withBearer(request, async () => tvJson({ key, items: await items(parsed) }));
}

export const dynamic = "force-dynamic";
