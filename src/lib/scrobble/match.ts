import "server-only";

import { queryVariants } from "@/lib/import/netflix-title";
import { createServiceClient } from "@/lib/supabase/server";
import { searchMovies, searchTv } from "@/lib/tmdb/client";
import type { TmdbMovieResult, TmdbTvResult } from "@/lib/tmdb/types";
import { escapeLike } from "@/lib/validate";
import { MATCH_THRESHOLD, scoreCandidate } from "./rank";
import type { ParsedMedia } from "./types";

export { MATCH_THRESHOLD, scoreCandidate };
export type { ScoreCandidate } from "./rank";

/** Quante righe di cache si valutano prima di rivolgersi a TMDB. */
const CACHE_CANDIDATES = 5;
/** Quanti risultati di una ricerca TMDB si valutano. */
const SEARCH_CANDIDATES = 8;
/**
 * Quante formulazioni del titolo si provano su TMDB prima di arrendersi. Il
 * tetto e' il costo: nel caso peggiore si moltiplica per i due tipi (film e
 * serie). Tre coprono titolo intero, senza parentesi e parte principale, cioe'
 * tutto quello che serve nella pratica.
 */
const MAX_VARIANTS = 3;

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Quali di questi id sono offerti dal provider su cui stiamo guardando, in
 * un'unica query invece di una per candidato.
 */
async function providersOffering(
  service: ServiceClient,
  mediaType: "movie" | "tv",
  providerId: number,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data } = await service
    .from("title_providers")
    .select("title_id")
    .eq("media_type", mediaType)
    .eq("provider_id", providerId)
    .in("title_id", ids);
  return new Set((data ?? []).map((row) => row.title_id));
}

/**
 * Popolarita' approssimata di una riga di cache: `titles` non salva quella di
 * TMDB (solo `vote_average`, 0-10), quindi la si stima da li'. E' solo una
 * delle due spinte piccole di `scoreCandidate` (max 0,04), non deve essere
 * precisa.
 */
function popularityFromVote(voteAverage: number | null): number {
  return Math.min(Math.max((voteAverage ?? 0) * 10, 0), 100);
}

/** Anno da una data ISO (`release_date`/`first_air_date`/`titles.release_date`). */
function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Cache titoli, poi ricerca TMDB. null significa nessuna corrispondenza;
 * gli errori temporanei vengono propagati affinche' l'ingest non confermi l'evento.
 */
export async function matchTitle(
  parsed: ParsedMedia,
  providerId: number,
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  if (parsed.kind === "unknown" || !parsed.title) return null;
  const service = createServiceClient();

  for (const mediaType of tipiDaProvare(parsed)) {
    const hit = await matchIn(service, parsed, providerId, mediaType);
    if (hit) return hit;
  }
  return null;
}

/**
 * In che ordine provare film e serie.
 *
 * Stagione o episodio riconosciuti sono una prova: e' una serie, e cercarla fra
 * i film e' solo un modo per prendere un omonimo sbagliato. Senza quella prova
 * `parsed.kind` e' l'ipotesi del sito (su Netflix: c'e' l'h4, quindi serie / non
 * c'e', quindi probabilmente film), e si prova prima quella — ma **si prova
 * anche l'altra**: prima si tentava solo la prima e un tipo indovinato male
 * costava il titolo per sempre, in silenzio.
 */
function tipiDaProvare(parsed: ParsedMedia): ("movie" | "tv")[] {
  if (parsed.season !== null || parsed.episode !== null) return ["tv"];
  return parsed.kind === "tv" ? ["tv", "movie"] : ["movie", "tv"];
}

/** Nome e nome originale di un risultato di ricerca, qualunque sia il tipo. */
function nomiDi(r: TmdbMovieResult | TmdbTvResult, mediaType: "movie" | "tv") {
  return mediaType === "tv"
    ? {
        name: (r as TmdbTvResult).name,
        originalName: (r as TmdbTvResult).original_name ?? null,
        date: (r as TmdbTvResult).first_air_date,
      }
    : {
        name: (r as TmdbMovieResult).title,
        originalName: (r as TmdbMovieResult).original_title ?? null,
        date: (r as TmdbMovieResult).release_date,
      };
}

/** Cerca dentro un solo tipo: prima la cache, poi TMDB su piu' formulazioni. */
async function matchIn(
  service: ServiceClient,
  parsed: ParsedMedia,
  providerId: number,
  mediaType: "movie" | "tv",
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  const { data: cached, error } = await service
    .from("titles")
    .select("id, title, original_title, vote_average, release_date")
    .eq("media_type", mediaType)
    .ilike("title", escapeLike(parsed.title))
    .limit(CACHE_CANDIDATES);

  if (error) throw error;
  if (cached && cached.length > 0) {
    const withProvider = await providersOffering(
      service,
      mediaType,
      providerId,
      cached.map((row) => row.id),
    );
    let bestCached: { id: number; score: number } | null = null;
    for (const row of cached) {
      const score = scoreCandidate(parsed, {
        name: row.title,
        originalName: row.original_title,
        year: yearFromDate(row.release_date),
        hasProvider: withProvider.has(row.id),
        popularity: popularityFromVote(row.vote_average),
      });
      if (!bestCached || score > bestCached.score) bestCached = { id: row.id, score };
    }
    if (bestCached && bestCached.score >= MATCH_THRESHOLD) {
      return { titleId: bestCached.id, mediaType };
    }
  }

  // Le formulazioni vanno dalla piu' specifica alla meno (titolo intero, senza
  // parentesi, parte principale, sottotitolo da solo) e ci si ferma alla prima
  // che convince: e' lo stesso elenco che usa l'import del CSV, dove Netflix
  // scrive i titoli allo stesso modo. Quasi sempre basta la prima, quindi il
  // costo normale resta una ricerca sola.
  for (const query of queryVariants(parsed.title).slice(0, MAX_VARIANTS)) {
    let top: (TmdbMovieResult | TmdbTvResult)[];
    try {
      const results =
        mediaType === "tv"
          ? (await searchTv(query)).results
          : (await searchMovies(query)).results;
      top = results.slice(0, SEARCH_CANDIDATES);
    } catch (err) {
      // Un errore di rete va ritentato; non e' un titolo sconosciuto.
      console.error(`[scrobble] ricerca TMDB fallita per "${query}"`, err);
      throw err;
    }
    if (top.length === 0) continue;

    const withProvider = await providersOffering(
      service,
      mediaType,
      providerId,
      top.map((r) => r.id),
    );

    let best: { id: number; score: number } | null = null;
    for (const r of top) {
      const { name, originalName, date } = nomiDi(r, mediaType);
      // Il punteggio si misura sempre contro il titolo **intero** letto dalla
      // pagina, non contro la formulazione ridotta usata per cercare: la
      // variante serve a farsi dare i candidati da TMDB, non ad abbassare
      // l'asticella con cui li si giudica.
      const score = scoreCandidate(parsed, {
        name,
        originalName,
        year: yearFromDate(date),
        hasProvider: withProvider.has(r.id),
        popularity: r.popularity ?? 0,
      });
      if (!best || score > best.score) best = { id: r.id, score };
    }

    if (best && best.score >= MATCH_THRESHOLD) return { titleId: best.id, mediaType };
  }

  return null;
}
