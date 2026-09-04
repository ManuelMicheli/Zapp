// Tipi delle risposte TMDB v3 (solo i campi usati dall'app).

export type TmdbMediaType = "movie" | "tv";

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbExternalIds {
  imdb_id?: string | null;
  wikidata_id?: string | null;
  tvdb_id?: number | null;
}

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

export interface TmdbWatchProvidersRegion {
  link?: string;
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
}

export interface TmdbWatchProvidersResponse {
  id?: number;
  results: Record<string, TmdbWatchProvidersRegion>;
}

export interface TmdbSearchResultBase {
  id: number;
  media_type: "movie" | "tv" | "person";
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  popularity?: number;
}

export interface TmdbMovieResult extends TmdbSearchResultBase {
  media_type: "movie";
  title: string;
  original_title?: string;
  release_date?: string;
}

export interface TmdbTvResult extends TmdbSearchResultBase {
  media_type: "tv";
  name: string;
  original_name?: string;
  first_air_date?: string;
}

export interface TmdbPersonResult extends TmdbSearchResultBase {
  media_type: "person";
  name: string;
}

export type TmdbMultiResult = TmdbMovieResult | TmdbTvResult | TmdbPersonResult;

export interface TmdbPaginated<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  order: number;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
}

export interface TmdbVideos {
  results: TmdbVideo[];
}

export interface TmdbSeasonSummary {
  id: number;
  season_number: number;
  name: string;
  poster_path: string | null;
  episode_count: number;
  air_date: string | null;
  overview: string | null;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  vote_average: number;
  vote_count: number;
  genres: TmdbGenre[];
  runtime: number | null;
  external_ids?: TmdbExternalIds;
  "watch/providers"?: TmdbWatchProvidersResponse;
  credits?: TmdbCredits;
  videos?: TmdbVideos;
  recommendations?: TmdbPaginated<TmdbMultiResult>;
  [key: string]: unknown;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  vote_average: number;
  vote_count: number;
  genres: TmdbGenre[];
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  episode_run_time?: number[];
  seasons?: TmdbSeasonSummary[];
  external_ids?: TmdbExternalIds;
  "watch/providers"?: TmdbWatchProvidersResponse;
  credits?: TmdbCredits;
  videos?: TmdbVideos;
  recommendations?: TmdbPaginated<TmdbMultiResult>;
  [key: string]: unknown;
}

export interface TmdbSeasonEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

export interface TmdbSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  air_date: string | null;
  episodes: TmdbSeasonEpisode[];
  /** Presente con `append_to_response=videos`: trailer della singola stagione. */
  videos?: TmdbVideos;
}
