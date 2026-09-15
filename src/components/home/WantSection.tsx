import { getPlatformShelves, mixShelf } from "@/lib/home/shelves";
import { HOME_SCOPE_VUOTO, scopeVuoto, type HomeScope } from "@/lib/home/scope";
import { filtraScope } from "@/lib/home/scope-filter";
import { createClient } from "@/lib/supabase/server";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { EntryWithTitle } from "@/lib/watch/queries";
import { applyScores, scoreMap } from "@/lib/ratings/cards";
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
export async function WantSection({
  want,
  scope = HOME_SCOPE_VUOTO,
}: {
  want: EntryWithTitle[];
  scope?: HomeScope;
}) {
  // Nella home filtrata "Da vedere" tiene solo ciò che sta nell'ambito, e le pillole
  // delle piattaforme si riducono a quella scelta (o alle novità di quel genere).
  const [platforms, nelloScope] = await Promise.all([
    getPlatformShelves(scope),
    scopeVuoto(scope)
      ? Promise.resolve(want)
      : createClient().then((db) =>
          filtraScope(
            db,
            want.map((e) => ({ id: e.title_id, mediaType: e.media_type, entry: e })),
            scope,
          ).then((tenuti) => tenuti.map((t) => t.entry)),
        ),
  ]);
  const movie = toItems(nelloScope, "movie");
  const tv = toItems(nelloScope, "tv");

  // Una lettura sola dei voti per tutta la sezione: la lista dell'utente e le sei
  // pillole delle piattaforme condividono parecchi titoli, e sono già tutte qui.
  const voti = await scoreMap(
    [...movie, ...tv, ...platforms.flatMap((p) => [...p.movie, ...p.tv])].map((i) => ({
      id: i.id,
      mediaType: i.mediaType,
    })),
  );

  const shelves: WantShelfPlatform[] = platforms.map((p) => {
    const film = applyScores(p.movie, voti);
    const serie = applyScores(p.tv, voti);
    return {
      id: p.id,
      name: p.name,
      logo: p.logo,
      items: { movie: film, tv: serie, all: mixShelf(film, serie) },
    };
  });

  if (movie.length === 0 && tv.length === 0 && shelves.length === 0) return null;

  const mieiFilm = applyScores(movie, voti);
  const mieSerie = applyScores(tv, voti);

  return (
    <WantShelf
      list={{ movie: mieiFilm, tv: mieSerie, all: mixShelf(mieiFilm, mieSerie) }}
      platforms={shelves}
    />
  );
}
