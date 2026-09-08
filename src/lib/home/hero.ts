import "server-only";
import { cache } from "react";
import { MAIN_PROVIDER_IDS } from "@/lib/config";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import {
  discoverByGenre,
  discoverNewOnStreaming,
  getMovieList,
  getTrending,
  getTvList,
} from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import { getRatings, ratingKey } from "@/lib/ratings/queries";
import { getRankedForYou } from "@/lib/rank/engine";
import { MASSA_MINIMA } from "@/lib/rank/vector";
import { getTasteProfile } from "@/lib/taste/queries";
import {
  buildHeroList,
  genreIdsFor,
  HERO_SIZE,
  mixHero,
  topGenreIds,
  type HeroItem,
  type HeroSource,
} from "./hero-rank";

export type { HeroItem } from "./hero-rank";

type MediaType = "movie" | "tv";

/** Quante righe della libreria leggere per dedurre i generi preferiti. */
const TASTE_SAMPLE = 300;

function toItems(
  results: TmdbMultiResult[] | null | undefined,
  type: MediaType,
): Omit<HeroItem, "reason">[] {
  return (results ?? [])
    .filter((r) => r.media_type === type)
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType: type,
      title: searchResultTitle(r),
      posterPath: r.poster_path as string,
      backdropPath: r.backdrop_path ?? null,
      overview: r.overview?.trim() || null,
      year: searchResultYear(r),
      genreIds: r.genre_ids ?? [],
      voteAverage: r.vote_average ?? null,
    }));
}

/**
 * Gusti dell'utente: i generi più frequenti fra ciò che ha visto o sta guardando,
 * e l'insieme dei titoli già in libreria (da non riproporre in testa alla home).
 * Una sola query leggera (`genres` è jsonb da pochi byte per riga).
 */
export const getTaste = cache(async () => {
  const user = await getViewer();
  const empty = { genreIds: [] as number[], owned: new Set<string>() };
  if (!user) return empty;
  const supabase = await createClient();
  const { data } = await supabase
    .from("watch_entries")
    .select(
      "title_id, media_type, status, title:titles!watch_entries_title_id_media_type_fkey(genres)",
    )
    .eq("user_id", user.id)
    .order("last_watched_at", { ascending: false })
    .limit(TASTE_SAMPLE);
  if (!data) return empty;
  const owned = new Set(data.map((e) => `${e.media_type}-${e.title_id}`));
  const genreIds = topGenreIds(
    data
      .filter((e) => e.status === "watched" || e.status === "watching")
      .map((e) => e.title?.genres),
  );
  return { genreIds, owned };
});

async function heroFor(
  type: MediaType,
  genreIds: number[],
  owned: ReadonlySet<string>,
): Promise<HeroItem[]> {
  const [fresh, forYou, trending, popular] = await Promise.all([
    discoverNewOnStreaming(type, MAIN_PROVIDER_IDS).catch(() => null),
    Promise.all(
      genreIdsFor(type, genreIds).map((g) => discoverByGenre(type, g).catch(() => null)),
    ),
    getTrending().catch(() => null),
    (type === "movie" ? getMovieList("popular") : getTvList("popular")).catch(() => null),
  ]);

  // "Per te": i due generi alternati, così il primo genere non monopolizza
  const byGenre = forYou.map((page) => toItems(page?.results, type));
  const forYouItems: Omit<HeroItem, "reason">[] = [];
  const longest = Math.max(0, ...byGenre.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of byGenre) if (list[i]) forYouItems.push(list[i]);
  }

  const sources: HeroSource[] = [
    { reason: "new", items: toItems(fresh?.results, type) },
    { reason: "for_you", items: forYouItems },
    { reason: "trending", items: toItems(trending?.results, type) },
    { reason: "popular", items: toItems(popular?.results, type) },
  ];
  return buildHeroList(sources, owned);
}

/** Sostituisce il voto TMDB con lo ZappScore dove il catalogo ce l'ha già. */
async function withZappScore(lists: HeroItem[][]): Promise<void> {
  const all = lists.flat();
  const ratings = await getRatings(
    all.map((i) => ({ id: i.id, mediaType: i.mediaType })),
  ).catch(() => new Map());
  for (const item of all) {
    const score = ratings.get(ratingKey(item.id, item.mediaType))?.score;
    if (score != null) item.voteAverage = score;
  }
}

/**
 * Le card in testa alla home: novità su streaming, titoli nei generi che l'utente
 * guarda di più, di tendenza e molto visti, a rotazione, mai titoli già in libreria.
 * Tre liste già pronte — film, serie e la mista di "Tutto" (uno per tipo a turno) —
 * così cambiare scheda non torna al server. Tutte le chiamate TMDB stanno in cache
 * Next (1h) e sono in gran parte condivise con gli scaffali "Scopri" sotto.
 */
/**
 * Le card del carosello prese dal motore di ranking (fase C): stessa affinità, stesso
 * motivo e stessi filtri degli scaffali, così la prima cosa che si vede aprendo Zapp
 * segue lo stesso algoritmo di tutto il resto e non una logica sua.
 *
 * Il carosello è a tutta larghezza: senza fondale una card non si può mostrare, quindi
 * i candidati che non ce l'hanno si scartano qui.
 */
async function heroDalMotore(type: MediaType): Promise<HeroItem[]> {
  const items = await getRankedForYou(type, HERO_SIZE * 3).catch(() => []);
  return items
    .filter((i) => i.backdropPath)
    .slice(0, HERO_SIZE)
    .map((i) => ({
      id: i.id,
      mediaType: i.mediaType,
      title: i.title,
      posterPath: i.posterPath,
      backdropPath: i.backdropPath,
      overview: i.overview,
      year: i.year,
      genreIds: i.genreIds,
      voteAverage: i.zappScore ?? i.voteAverage,
      reason: "for_you" as const,
      affinity: i.percentuale,
      motivo: i.motivo,
    }));
}

export const getHomeHero = cache(
  async (): Promise<{ movie: HeroItem[]; tv: HeroItem[]; all: HeroItem[] }> => {
    const user = await getViewer();
    const profilo = user ? await getTasteProfile(user.id).catch(() => null) : null;

    // Con un profilo che ha qualcosa da dire il carosello è il motore; con un profilo
    // povero restano novità, tendenze e popolari, che a un utente nuovo dicono di più
    // di un'affinità inventata. È la stessa regola dell'ordine degli scaffali.
    if ((profilo?.massa ?? 0) >= MASSA_MINIMA) {
      const [movie, tv] = await Promise.all([
        heroDalMotore("movie"),
        heroDalMotore("tv"),
      ]);
      if (movie.length > 0 || tv.length > 0) {
        return { movie, tv, all: mixHero(movie, tv) };
      }
    }

    const { genreIds, owned } = await getTaste();
    const [movie, tv] = await Promise.all([
      heroFor("movie", genreIds, owned),
      heroFor("tv", genreIds, owned),
    ]);
    await withZappScore([movie, tv]);
    return { movie, tv, all: mixHero(movie, tv) };
  },
);
