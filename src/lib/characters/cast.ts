import "server-only";
import { unstable_cache } from "next/cache";
import { getTvCastSources } from "@/lib/tmdb/client";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { cleanCharacter } from "./rank";

/** Quanti personaggi si possono votare: i più presenti su tutte le stagioni. */
export const VOTABLE_MAX = 16;

/** Id TMDB del genere Animazione: il nome arriva in italiano ("Animazione"), l'id no. */
const GENRE_ANIMATION = 16;

export interface SeriesCast {
  cast: TmdbCastMember[];
  imdbId: string | null;
  name: string;
  originalName: string | null;
  /** Animazione giapponese: i ritratti si cercano anche su AniList. */
  isAnime: boolean;
}

const EMPTY: SeriesCast = {
  cast: [],
  imdbId: null,
  name: "",
  originalName: null,
  isAnime: false,
};

/**
 * Dentro `unstable_cache` un errore **non** si cachea, un valore sì: per questo
 * qui si lascia propagare il fallimento di TMDB, e lo cattura il wrapper sotto.
 * Ritornare un cast vuoto da qui lo avrebbe congelato per 7 giorni.
 */
const cachedSeriesCast = unstable_cache(
  async (tvId: number): Promise<SeriesCast> => {
    const d = await getTvCastSources(tvId);
    const cast = [...(d.aggregate_credits?.cast ?? [])]
      .sort((a, b) => b.total_episode_count - a.total_episode_count || a.order - b.order)
      .slice(0, VOTABLE_MAX)
      .map((m, index) => ({
        id: m.id,
        name: m.name,
        character: cleanCharacter(
          [...m.roles]
            .sort((a, b) => b.episode_count - a.episode_count)
            .map((r) => r.character)
            .filter(Boolean)
            .join(" / "),
        ),
        profile_path: m.profile_path,
        order: index,
      }))
      .filter((m) => m.character.length > 0);
    return {
      cast,
      imdbId: d.external_ids?.imdb_id ?? null,
      name: d.name,
      originalName: d.original_name ?? null,
      isAnime:
        (d.genres ?? []).some((g) => g.id === GENRE_ANIMATION) &&
        (d.origin_country ?? []).includes("JP"),
    };
  },
  ["series-cast"],
  { revalidate: 7 * 86400 },
);

/**
 * I personaggi votabili di una serie: `aggregate_credits` di TMDB ordinato per
 * episodi totali, non `credits` (che elenca solo i regolari dell'ultima
 * stagione: Shameless senza Fiona Gallagher). Cache 7 giorni per serie. Se
 * TMDB non risponde, cast vuoto (non cachato): chi chiama ricade su `titles.raw`.
 */
export async function getSeriesCast(tvId: number): Promise<SeriesCast> {
  try {
    return await cachedSeriesCast(tvId);
  } catch (e) {
    console.error("getSeriesCast", tvId, e);
    return EMPTY;
  }
}
