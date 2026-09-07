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
import {
  buildHeroList,
  genreIdsFor,
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
const getTaste = cache(async () => {
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

/**
 * Le card in testa alla home, film e serie separati: novità su streaming, titoli nei
 * generi che l'utente guarda di più, di tendenza e molto visti, a rotazione, mai
 * titoli già in libreria. Tutte le chiamate TMDB stanno in cache Next (1h) e sono in
 * gran parte condivise con gli scaffali "Scopri" sotto.
 */
export const getHomeHero = cache(
  async (): Promise<{ movie: HeroItem[]; tv: HeroItem[] }> => {
    const { genreIds, owned } = await getTaste();
    const [movie, tv] = await Promise.all([
      heroFor("movie", genreIds, owned),
      heroFor("tv", genreIds, owned),
    ]);
    return { movie, tv };
  },
);
