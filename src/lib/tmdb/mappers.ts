import type { Json, Tables, TablesInsert } from "@/types/database";
import type {
  TmdbMovieDetails,
  TmdbMultiResult,
  TmdbTvDetails,
  TmdbWatchProvider,
} from "./types";

export type TitleRow = Tables<"titles">;
export type TitleInsert = TablesInsert<"titles">;
export type TitleProviderInsert = TablesInsert<"title_providers">;

/** Risultato di ricerca normalizzato per l'UI. */
export interface SearchItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string | null;
  voteAverage: number | null;
  providers: { id: number; name: string; logoPath: string | null }[];
}

function emptyToNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

export function mapMovieToTitleInsert(movie: TmdbMovieDetails): TitleInsert {
  return {
    id: movie.id,
    media_type: "movie",
    title: movie.title,
    original_title: emptyToNull(movie.original_title),
    overview: emptyToNull(movie.overview),
    poster_path: emptyToNull(movie.poster_path),
    backdrop_path: emptyToNull(movie.backdrop_path),
    release_date: emptyToNull(movie.release_date),
    vote_average: movie.vote_average != null ? Math.round(movie.vote_average * 10) / 10 : null,
    vote_count: movie.vote_count ?? null,
    genres: (movie.genres ?? []) as unknown as Json,
    runtime: movie.runtime ?? null,
    number_of_seasons: null,
    number_of_episodes: null,
    external_ids: (movie.external_ids ?? null) as unknown as Json,
    raw: movie as unknown as Json,
    fetched_at: new Date().toISOString(),
  };
}

export function mapTvToTitleInsert(tv: TmdbTvDetails): TitleInsert {
  return {
    id: tv.id,
    media_type: "tv",
    title: tv.name,
    original_title: emptyToNull(tv.original_name),
    overview: emptyToNull(tv.overview),
    poster_path: emptyToNull(tv.poster_path),
    backdrop_path: emptyToNull(tv.backdrop_path),
    release_date: emptyToNull(tv.first_air_date),
    vote_average: tv.vote_average != null ? Math.round(tv.vote_average * 10) / 10 : null,
    vote_count: tv.vote_count ?? null,
    genres: (tv.genres ?? []) as unknown as Json,
    runtime: tv.episode_run_time?.[0] ?? null,
    number_of_seasons: tv.number_of_seasons ?? null,
    number_of_episodes: tv.number_of_episodes ?? null,
    external_ids: (tv.external_ids ?? null) as unknown as Json,
    raw: tv as unknown as Json,
    fetched_at: new Date().toISOString(),
  };
}

export function mapProvidersToInserts(
  titleId: number,
  mediaType: "movie" | "tv",
  providers: { flatrate: TmdbWatchProvider[]; rent: TmdbWatchProvider[]; buy: TmdbWatchProvider[] },
): TitleProviderInsert[] {
  const now = new Date().toISOString();
  const rows: TitleProviderInsert[] = [];
  for (const kind of ["flatrate", "rent", "buy"] as const) {
    for (const p of providers[kind]) {
      rows.push({
        title_id: titleId,
        media_type: mediaType,
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path,
        kind,
        fetched_at: now,
      });
    }
  }
  return rows;
}

export function searchResultYear(result: TmdbMultiResult): string | null {
  if (result.media_type === "movie") {
    return result.release_date ? result.release_date.slice(0, 4) : null;
  }
  if (result.media_type === "tv") {
    return result.first_air_date ? result.first_air_date.slice(0, 4) : null;
  }
  return null;
}

export function searchResultTitle(result: TmdbMultiResult): string {
  return result.media_type === "movie" ? result.title : result.name;
}
