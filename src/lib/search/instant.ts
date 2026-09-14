import "server-only";

import { searchMulti } from "@/lib/tmdb/client";
import {
  searchResultTitle,
  searchResultYear,
  type SearchItem,
  type SearchPerson,
} from "@/lib/tmdb/mappers";
import { createClient } from "@/lib/supabase/server";
import { getRatings, ratingKey } from "@/lib/ratings/queries";

/** Quanti risultati restituire (una pagina TMDB ne ha 20). */
const RESULT_LIMIT = 20;

/**
 * Ricerca istantanea: una chiamata TMDB (cache Next 5 min per query) più una sola
 * query batch sui provider già in cache (`title_providers`, flatrate). Nessun
 * `getOrFetchTitle` per risultato: quello scaricava e salvava il dettaglio di 12
 * titoli a ogni tasto. I provider dei titoli mai aperti compaiono appena qualcuno
 * apre la scheda. Condivisa dalla rotta web `/api/search` e da `/api/tv/v1/search`.
 */
export async function instantSearch(query: string): Promise<SearchItem[]> {
  const search = await searchMulti(query);
  const media = search.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, RESULT_LIMIT);

  const supabase = await createClient();
  const { data: providerRows } = media.length
    ? await supabase
        .from("title_providers")
        .select("title_id, media_type, provider_id, provider_name, logo_path")
        .in(
          "title_id",
          media.map((r) => r.id),
        )
        .eq("kind", "flatrate")
    : { data: [] };

  const providersByKey = new Map<string, SearchItem["providers"]>();
  for (const row of providerRows ?? []) {
    const key = `${row.media_type}:${row.title_id}`;
    const list = providersByKey.get(key) ?? [];
    if (!list.some((p) => p.id === row.provider_id)) {
      list.push({
        id: row.provider_id,
        name: row.provider_name,
        logoPath: row.logo_path,
      });
    }
    providersByKey.set(key, list);
  }

  const items: SearchItem[] = media.map((result) => {
    const mediaType = result.media_type as "movie" | "tv";
    return {
      id: result.id,
      mediaType,
      title: searchResultTitle(result),
      posterPath: result.poster_path ?? null,
      year: searchResultYear(result) ?? null,
      voteAverage: result.vote_average ?? null,
      providers: providersByKey.get(`${mediaType}:${result.id}`) ?? [],
    };
  });

  const ratings = await getRatings(
    items.map((i) => ({ id: i.id, mediaType: i.mediaType })),
  ).catch(() => new Map());
  for (const item of items) {
    const riga = ratings.get(ratingKey(item.id, item.mediaType));
    if (riga?.score != null) {
      item.voteAverage = riga.score;
      item.votes = riga.votes;
    }
  }

  return items;
}

/** Quante persone: piu' di quattro e la riga diventa un secondo elenco. */
const PEOPLE_LIMIT = 4;

/**
 * Le persone della stessa ricerca. Funzione a parte, e non un secondo campo di
 * `instantSearch`, perche' quella la usa anche l'app TV, che di persone non sa nulla:
 * cambiarle il tipo di ritorno per un bisogno del web sarebbe una modifica a due
 * consumatori per servirne uno. `searchMulti` e' la stessa richiesta HTTP, quindi
 * Next la serve dalla cache della richiesta: chiamarla due volte non costa una
 * seconda chiamata a TMDB.
 *
 * Solo chi recita o dirige, e solo con una foto: gli altri reparti riempirebbero la
 * riga di nomi che a chi cerca un film non dicono nulla. Nessun voto e nessun
 * provider: per le persone non esistono.
 */
export async function instantPeople(query: string): Promise<SearchPerson[]> {
  const search = await searchMulti(query);
  const out: SearchPerson[] = [];
  for (const r of search.results) {
    if (r.media_type !== "person") continue;
    if (!r.profile_path) continue;
    if (r.known_for_department !== "Acting" && r.known_for_department !== "Directing") {
      continue;
    }
    out.push({
      id: r.id,
      name: r.name,
      profilePath: r.profile_path,
    });
    if (out.length === PEOPLE_LIMIT) break;
  }
  return out;
}
