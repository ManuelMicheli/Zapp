import "server-only";

import { TMDB_LANGUAGE, TMDB_REGION } from "@/lib/config";
import type {
  TmdbCollectionDetails,
  TmdbExternalIds,
  TmdbImage,
  TmdbMovieDetails,
  TmdbMovieResult,
  TmdbMultiResult,
  TmdbPaginated,
  TmdbPersonDetails,
  TmdbPersonMovieCredits,
  TmdbPersonTvCredits,
  TmdbSeasonDetails,
  TmdbTvDetails,
  TmdbTvResult,
  TmdbWatchProvider,
  TmdbWatchProvidersResponse,
} from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Rate limiter in memoria: massimo MAX_PER_WINDOW passaggi per finestra.
 *
 * Attenzione a cosa conta davvero: il limitatore sta *prima* di `fetch`, e la cache
 * dati di Next sta *dentro* `fetch`. Una risposta servita dalla cache non arriva mai a
 * TMDB, ma qui viene messa in coda come se fosse una richiesta di rete: è latenza che
 * ci infliggiamo da soli. "Continua a guardare" ne è il caso peggiore — 20 tessere ×
 * (grafiche + stagione) = 40 passaggi, quasi tutti già in cache, che a 15/s facevano
 * ~2,7 s di sola attesa in coda.
 *
 * TMDB regge ~50 richieste/s: 30 resta abbondantemente sotto e dimezza la coda.
 */
const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 30;
let windowStart = Date.now();
let windowCount = 0;

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (windowCount < MAX_PER_WINDOW) {
      windowCount += 1;
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - windowStart) + 5));
  }
}

interface TmdbFetchOptions {
  params?: Record<string, string>;
  /** Secondi di cache Next per la risposta (default 3600). */
  revalidate?: number;
}

/**
 * Memo in-process davanti al throttle: stessa URL entro il suo `revalidate` →
 * stessa promise, senza passare dal limitatore. Senza, ogni render (home, cerca,
 * prefetch delle 5 voci di nav) rifaceva 10–15 `tmdbFetch` che la cache `fetch` di
 * Next serviva dal disco ma che il throttle a 15/s metteva comunque in coda:
 * misurati 10 s di TTFB con 375 chiamate in un giro di navigazione. Deduplica anche
 * le richieste in volo. Cap di voci per non crescere senza limite.
 */
const MEMO_MAX_ENTRIES = 500;
const memo = new Map<string, { expires: number; promise: Promise<unknown> }>();

async function tmdbFetch<T>(path: string, options: TmdbFetchOptions = {}): Promise<T> {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token || token.startsWith("INSERISCI")) {
    throw new Error("TMDB_API_READ_ACCESS_TOKEN mancante in .env.local");
  }

  const url = new URL(`${TMDB_BASE}/${path.replace(/^\//, "")}`);
  url.searchParams.set("language", TMDB_LANGUAGE);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const key = url.toString();
  const revalidate = options.revalidate ?? 3600;
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.expires > now) return hit.promise as Promise<T>;

  const promise = (async () => {
    await throttle();
    // Una riga per chiamata è preziosa mentre si mette a punto la cache, ma in
    // produzione sono decine di righe per richiesta scritte sullo stream dei log di
    // Vercel: rumore che copre gli errori veri e I/O dentro il percorso caldo.
    if (process.env.NODE_ENV !== "production" || process.env.TMDB_DEBUG === "1") {
      console.log(`[tmdb] fetch ${url.pathname}${url.search}`);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) {
      throw new Error(`TMDB ${res.status} su ${url.pathname}`);
    }
    return (await res.json()) as T;
  })();
  // un errore non resta in memo: il prossimo chiamante riprova
  promise.catch(() => memo.delete(key));

  if (memo.size >= MEMO_MAX_ENTRIES) {
    for (const [k, v] of memo) {
      if (v.expires <= now) memo.delete(k);
    }
    if (memo.size >= MEMO_MAX_ENTRIES) memo.delete(memo.keys().next().value as string);
  }
  memo.set(key, { expires: now + revalidate * 1000, promise });
  return promise;
}

export async function searchMulti(
  query: string,
  page = 1,
): Promise<TmdbPaginated<TmdbMultiResult>> {
  return tmdbFetch<TmdbPaginated<TmdbMultiResult>>("search/multi", {
    params: {
      query,
      page: String(page),
      region: TMDB_REGION,
      include_adult: "false",
    },
    revalidate: 300,
  });
}

/** Ricerca film per titolo (e anno se noto), regione IT: per abbinare i titoli MyMovies. */
export async function searchMovie(
  query: string,
  year?: number | null,
): Promise<TmdbPaginated<TmdbMovieResult>> {
  const params: Record<string, string> = {
    query,
    region: TMDB_REGION,
    include_adult: "false",
  };
  if (year) params.year = String(year);
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMovieResult, "media_type">>>(
    "search/movie",
    { params, revalidate: 86400 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "movie" }) as TmdbMovieResult),
  };
}

/** Ricerca solo film (`search/movie`): per l'import, dove il tipo è già noto. */
export async function searchMovies(
  query: string,
  options: { language?: string } = {},
): Promise<TmdbPaginated<TmdbMovieResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMovieResult, "media_type">>>(
    "search/movie",
    {
      params: {
        query,
        region: TMDB_REGION,
        include_adult: "false",
        ...(options.language ? { language: options.language } : {}),
      },
      revalidate: 300,
    },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "movie" }) as TmdbMovieResult),
  };
}

/** Ricerca solo serie (`search/tv`): per l'import, dove il tipo è già noto. */
export async function searchTv(
  query: string,
  options: { language?: string } = {},
): Promise<TmdbPaginated<TmdbTvResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbTvResult, "media_type">>>(
    "search/tv",
    {
      params: {
        query,
        include_adult: "false",
        ...(options.language ? { language: options.language } : {}),
      },
      revalidate: 300,
    },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "tv" }) as TmdbTvResult),
  };
}

export async function getTrending(page = 1): Promise<TmdbPaginated<TmdbMultiResult>> {
  return tmdbFetch<TmdbPaginated<TmdbMultiResult>>("trending/all/week", {
    params: page > 1 ? { page: String(page) } : undefined,
    revalidate: 3600,
  });
}

/**
 * append_to_response completo: una sola chiamata per l'intera scheda titolo.
 * `release_dates` (film) e `content_ratings` (serie) servono alla scheda tecnica:
 * uscita italiana ed età consigliata.
 */
const DETAILS_APPEND_MOVIE =
  "credits,videos,recommendations,external_ids,watch/providers,release_dates,keywords";
const DETAILS_APPEND_TV =
  "credits,videos,recommendations,external_ids,watch/providers,content_ratings,keywords";

/**
 * `language=it-IT` da solo restituisce solo i video in italiano. Si chiedono anche
 * inglese e senza lingua così, se manca proprio un trailer IT, `rankTrailers` può
 * cadere sull'inglese; se c'è almeno un IT il fondale resta solo su quelli.
 */
const VIDEO_LANGUAGES = "it,en,null";

/** Dettaglio film completo (cast, video, simili, external_ids, providers). */
export async function getMovie(id: number): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`movie/${id}`, {
    params: {
      append_to_response: DETAILS_APPEND_MOVIE,
      include_video_language: VIDEO_LANGUAGES,
    },
    revalidate: 3600,
  });
}

/** Dettaglio serie completo (cast, video, simili, external_ids, providers). */
export async function getTv(id: number): Promise<TmdbTvDetails> {
  return tmdbFetch<TmdbTvDetails>(`tv/${id}`, {
    params: {
      append_to_response: DETAILS_APPEND_TV,
      include_video_language: VIDEO_LANGUAGES,
    },
    revalidate: 3600,
  });
}

export const getMovieDetails = getMovie;
export const getTvDetails = getTv;

export interface TmdbGenreList {
  genres: { id: number; name: string }[];
}

export async function getGenres(type: "movie" | "tv"): Promise<TmdbGenreList> {
  return tmdbFetch<TmdbGenreList>(`genre/${type}/list`, { revalidate: 86400 });
}

/**
 * Novità in streaming sui provider principali IT, ordinate per data di uscita.
 *
 * `sortByPopularity` ribalta l'ordinamento a `popularity.desc`: serve solo al ripiego
 * delle classifiche per provider (`charts/justwatch.ts`), dove il risultato viene
 * presentato come "i più visti" — ordinarlo per data darebbe una lista di novità con
 * posizioni di classifica inventate. Il comportamento predefinito resta per data,
 * perché lo usano anche home e Scopri, che vogliono proprio le novità.
 */
export async function discoverNewOnStreaming(
  type: "movie" | "tv",
  providerIds: readonly number[],
  options: { sortByPopularity?: boolean } = {},
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const dateParam = type === "movie" ? "primary_release_date.lte" : "first_air_date.lte";
  const sort = options.sortByPopularity
    ? "popularity.desc"
    : type === "movie"
      ? "primary_release_date.desc"
      : "first_air_date.desc";
  const today = new Date().toISOString().slice(0, 10);
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    {
      params: {
        with_watch_providers: providerIds.join("|"),
        watch_region: TMDB_REGION,
        sort_by: sort,
        [dateParam]: today,
        "vote_count.gte": "20",
      },
      revalidate: 3600,
    },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

export type MovieListKind = "now_playing" | "upcoming" | "popular";
export type TvListKind = "popular" | "on_the_air";

/** Liste curate TMDB per i film (al cinema, in arrivo, popolari), regione IT. */
export async function getMovieList(
  kind: MovieListKind,
  page = 1,
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `movie/${kind}`,
    { params: { region: TMDB_REGION, page: String(page) }, revalidate: 3600 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "movie" }) as TmdbMultiResult),
  };
}

/** Liste curate TMDB per le serie (popolari, in onda). */
export async function getTvList(
  kind: TvListKind,
  page = 1,
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `tv/${kind}`,
    { params: { page: String(page) }, revalidate: 3600 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: "tv" }) as TmdbMultiResult),
  };
}

/**
 * "Più amati di sempre": media voto con soglia alta di voti, così emergono i classici
 * e non i titoli appena usciti con pochi voti (come fa `movie/top_rated`).
 * Per le serie esclude animazione, kids, reality e talk show.
 */
export async function discoverTopRated(
  type: "movie" | "tv",
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const params: Record<string, string> =
    type === "movie"
      ? { sort_by: "vote_average.desc", "vote_count.gte": "5000" }
      : {
          sort_by: "vote_average.desc",
          "vote_count.gte": "2000",
          without_genres: "16,10763,10764,10767",
        };
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    { params, revalidate: 86400 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

export async function discoverByGenre(
  type: "movie" | "tv",
  genreId: number,
  page = 1,
  options: { scriptedOnly?: boolean; minVotes?: number; minScore?: number } = {},
): Promise<TmdbPaginated<TmdbMultiResult>> {
  // `with_type=2|4` = miniserie o serie sceneggiata. Lo chiede solo il motore di
  // ranking: senza, fra i consigli finivano Good Mythical Morning e All Elite
  // Wrestling, che hanno il genere "Commedia" o "Azione" come una serie qualsiasi e
  // migliaia di puntate alle spalle. Gli scaffali che chiamano questa funzione senza
  // il parametro continuano a comportarsi come prima.
  const soloSceneggiate = options.scriptedOnly && type === "tv";
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    {
      params: {
        with_genres: String(genreId),
        sort_by: "popularity.desc",
        page: String(page),
        "vote_count.gte": String(options.minVotes ?? 50),
        ...(options.minScore ? { "vote_average.gte": String(options.minScore) } : {}),
        ...(soloSceneggiate ? { with_type: "2|4" } : {}),
      },
      revalidate: 3600,
    },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

/**
 * "Perche' hai visto X": i titoli che TMDB accosta a un titolo. Stesso tipo del
 * titolo di partenza (le raccomandazioni di un film sono film).
 */
export async function getRecommendations(
  type: "movie" | "tv",
  id: number,
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `${type}/${id}/recommendations`,
    { revalidate: 86400 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

/**
 * I titoli che TMDB considera "simili" (per generi e keyword, non per pubblico):
 * un secondo parere accanto a `recommendations`, che invece è collaborativo.
 */
export async function getSimilar(
  type: "movie" | "tv",
  id: number,
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `${type}/${id}/similar`,
    { revalidate: 86400 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

/** Voti minimi perché un titolo entri fra i candidati dei consigli. */
const DISCOVER_MIN_VOTES = { movie: "50", tv: "20" } as const;

/**
 * Titoli che portano *tutte* le keyword chieste (la virgola in `with_keywords` è un
 * AND). Il `total_results` della risposta serve quanto i risultati: dice quanti
 * titoli portano quella keyword, cioè quanto è rara — è così che il motore dei
 * consigli pesa i temi senza pagare una sola chiamata in più.
 */
export async function discoverByKeyword(
  type: "movie" | "tv",
  keywordIds: readonly number[],
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    {
      params: {
        with_keywords: keywordIds.join(","),
        sort_by: "popularity.desc",
        "vote_count.gte": DISCOVER_MIN_VOTES[type],
      },
      revalidate: 86400,
    },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}

/**
 * I film di una persona, con il ruolo di ciascuno. Si passa di qui e non da
 * `discover?with_crew=`, che accosta **qualunque** ruolo di troupe: con quello, un
 * film in cui il regista del seme compare come produttore o ringraziamento risultava
 * "suo" e finiva secondo fra i simili (visto su Dune, 2026-09-07).
 */
export async function getPersonMovieCredits(
  personId: number,
): Promise<TmdbPersonMovieCredits> {
  return tmdbFetch<TmdbPersonMovieCredits>(`person/${personId}/movie_credits`, {
    revalidate: 86400,
  });
}

/** Le serie di una persona, da attrice o da autrice. */
export async function getPersonTvCredits(personId: number): Promise<TmdbPersonTvCredits> {
  return tmdbFetch<TmdbPersonTvCredits>(`person/${personId}/tv_credits`, {
    revalidate: 86400,
  });
}

/** I capitoli di una saga. */
export async function getCollection(
  collectionId: number,
): Promise<TmdbCollectionDetails> {
  return tmdbFetch<TmdbCollectionDetails>(`collection/${collectionId}`, {
    revalidate: 86400,
  });
}

export async function getSeason(
  tvId: number,
  seasonNumber: number,
): Promise<TmdbSeasonDetails> {
  return tmdbFetch<TmdbSeasonDetails>(`tv/${tvId}/season/${seasonNumber}`, {
    params: { append_to_response: "videos", include_video_language: VIDEO_LANGUAGES },
    revalidate: 3600,
  });
}

/** Fotogrammi di un episodio con dimensioni: servono a scegliere lo sfondo più definito. */
export async function getEpisodeImages(
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{ stills: TmdbImage[] }> {
  // `language=it-IT` da solo filtra via quasi tutti i fotogrammi (sono senza lingua):
  // include_image_language riporta anche quelli neutri e in inglese
  return tmdbFetch<{ stills: TmdbImage[] }>(
    `tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/images`,
    { params: { include_image_language: "null,it,en" }, revalidate: 7 * 86400 },
  );
}

/**
 * Grafiche ufficiali di un titolo con dimensioni: servono a "Continua a guardare",
 * che mostra un'immagine del titolo (mai il fotogramma dell'episodio) e la cambia
 * a ogni visita. `language=it-IT` da solo filtra via quasi tutte le grafiche
 * (le migliori sono senza scritte, quindi senza lingua).
 */
export async function getTitleImages(
  mediaType: "movie" | "tv",
  id: number,
): Promise<{ backdrops: TmdbImage[] }> {
  return tmdbFetch<{ backdrops: TmdbImage[] }>(`${mediaType}/${id}/images`, {
    params: { include_image_language: "null,it,en" },
    revalidate: 7 * 86400,
  });
}

export interface ItProviders {
  flatrate: TmdbWatchProvider[];
  rent: TmdbWatchProvider[];
  buy: TmdbWatchProvider[];
}

/**
 * Elenco provider disponibili in Italia (id, nome, logo), cache 7 giorni.
 * Unione delle liste film e serie: alcuni (es. Discovery+) compaiono solo fra le serie.
 */
export async function getProviderList(): Promise<TmdbWatchProvider[]> {
  const [movie, tv] = await Promise.all(
    (["movie", "tv"] as const).map((type) =>
      tmdbFetch<{ results: TmdbWatchProvider[] }>(`watch/providers/${type}`, {
        params: { watch_region: TMDB_REGION },
        revalidate: 7 * 86400,
      }),
    ),
  );
  const byId = new Map<number, TmdbWatchProvider>();
  for (const p of [...movie.results, ...tv.results]) {
    if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
  }
  return [...byId.values()];
}

/** Filtra la risposta watch/providers sulla sola regione IT. */
export function extractItProviders(
  response: TmdbWatchProvidersResponse | undefined,
): ItProviders {
  const region = response?.results?.[TMDB_REGION];
  return {
    flatrate: region?.flatrate ?? [],
    rent: region?.rent ?? [],
    buy: region?.buy ?? [],
  };
}

export async function getWatchProviders(
  id: number,
  type: "movie" | "tv",
): Promise<ItProviders> {
  const response = await tmdbFetch<TmdbWatchProvidersResponse>(
    `${type}/${id}/watch/providers`,
    { revalidate: 3600 },
  );
  return extractItProviders(response);
}

export async function getExternalIds(
  id: number,
  type: "movie" | "tv",
): Promise<TmdbExternalIds> {
  return tmdbFetch<TmdbExternalIds>(`${type}/${id}/external_ids`, {
    revalidate: 86400,
  });
}

/** Scheda di una persona (cache 30 g): serve solo per la faccia dell'avatar. */
export async function getPerson(id: number): Promise<TmdbPersonDetails> {
  return tmdbFetch<TmdbPersonDetails>(`person/${id}`, { revalidate: 30 * 86400 });
}

export interface TmdbFindResult {
  movie_results: {
    id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date?: string;
  }[];
}

/** IMDb id ("tt1234567") → film TMDB (cache 24 h). */
export async function findByImdb(imdbId: string): Promise<TmdbFindResult> {
  return tmdbFetch<TmdbFindResult>(`find/${imdbId}`, {
    params: { external_source: "imdb_id" },
    revalidate: 86400,
  });
}

/** Proxy generico usato da /api/tmdb/[...path]. */
export async function proxyGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  return tmdbFetch<unknown>(path, { params, revalidate: 300 });
}

/** I filtri di una ricetta del momento, con i generi già tradotti per il tipo. */
export interface DiscoverRecipe {
  generi: number[];
  senzaGeneri?: number[];
  keyword?: number[];
  runtimeMax?: number;
  runtimeMin?: number;
}

/**
 * Le stesse soglie del motore di ranking: un consiglio è un titolo che qualcuno ha già
 * visto e apprezzato, non una novità qualsiasi.
 */
const RECIPE_SOGLIE = {
  movie: { voti: 300, voto: 6 },
  tv: { voti: 100, voto: 6.5 },
} as const;

/**
 * I candidati di un momento ("Per una domenica di pioggia") o di un mood.
 * `revalidate: 3600` e nessun parametro personale: la cache di Next è **condivisa fra
 * tutti gli utenti**, quindi un momento attivo costa una chiamata l'ora per tipo, non
 * una per visita.
 */
export async function discoverForRecipe(
  type: "movie" | "tv",
  recipe: DiscoverRecipe,
  options: { conKeyword?: boolean } = {},
): Promise<TmdbPaginated<TmdbMultiResult>> {
  const soglie = RECIPE_SOGLIE[type];
  const params: Record<string, string> = {
    // `|` = o, `,` = e: una ricetta vuole l'unione dei suoi generi, non l'intersezione
    with_genres: recipe.generi.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": String(soglie.voti),
    "vote_average.gte": String(soglie.voto),
  };
  if (recipe.senzaGeneri?.length) {
    params.without_genres = recipe.senzaGeneri.join(",");
  }
  if (options.conKeyword && recipe.keyword?.length) {
    params.with_keywords = recipe.keyword.join("|");
  }
  if (recipe.runtimeMax) params["with_runtime.lte"] = String(recipe.runtimeMax);
  if (recipe.runtimeMin) params["with_runtime.gte"] = String(recipe.runtimeMin);
  // niente talk show né wrestling fra i consigli: solo serie sceneggiate e miniserie
  if (type === "tv") params.with_type = "2|4";

  const data = await tmdbFetch<TmdbPaginated<Omit<TmdbMultiResult, "media_type">>>(
    `discover/${type}`,
    { params, revalidate: 3600 },
  );
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, media_type: type }) as TmdbMultiResult),
  };
}
