import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { discoverTopRated, getTrending } from "@/lib/tmdb/client";
import { pickSeedGrid, type SeedCandidate } from "./seed";
import type { Json } from "@/types/database";

/** Quante righe di classifica leggere prima di filtrare e diversificare. */
const RIGHE_CLASSIFICA = 120;

interface RigaClassifica {
  rank: number;
  titles: {
    id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    genres: Json | null;
  } | null;
}

function generiDi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

/**
 * I candidati per la griglia dell'onboarding.
 *
 * Nessuna chiamata nuova a servizi esterni: le classifiche stanno già in
 * `title_charts` (fase B) e il trending è la stessa `fetch` che usa Scopri, quindi ne
 * condivide la cache Next da un'ora. Se entrambe le fonti mancassero, la griglia torna
 * vuota e il passo 2 dell'onboarding **non compare**: meglio un passo in meno che una
 * schermata rotta davanti a chi apre Zapp per la prima volta.
 *
 * Il join usa l'hint FK esplicito `titles!title_charts_title_fkey`: la chiave è
 * composita (`title_id, media_type`) e PostgREST non la deduce — un hint implicito
 * darebbe 400 e una griglia vuota in silenzio.
 */
export const getSeedCandidates = cache(async (): Promise<SeedCandidate[]> => {
  const supabase = await createClient();

  const [classifiche, trending, classiciFilm, classiciSerie] = await Promise.all([
    supabase
      .from("title_charts")
      .select(
        "rank, titles!title_charts_title_fkey(id, media_type, title, poster_path, genres)",
      )
      .eq("country", "IT")
      .not("title_id", "is", null)
      .order("period", { ascending: false })
      .limit(RIGHE_CLASSIFICA),
    getTrending().catch(() => null),
    // I più amati di sempre: sono questi a far capire un gusto, non le novità.
    discoverTopRated("movie").catch(() => null),
    discoverTopRated("tv").catch(() => null),
  ]);

  if (classifiche.error) {
    console.error("[seed] classifiche non lette:", classifiche.error.message);
  }

  const candidati: SeedCandidate[] = [];
  const punteggi = new Map<string, number | null>();

  const righe = (classifiche.data ?? []) as unknown as RigaClassifica[];
  for (const r of righe) {
    const t = r.titles;
    if (!t?.poster_path) continue;
    candidati.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      genreIds: generiDi(t.genres),
      fonte: "classifica",
      rank: r.rank,
      score: null,
    });
  }

  // Lo ZappScore in una seconda query, indicizzato per chiave composita: il join
  // diretto su `title_ratings` avrebbe la stessa ambiguità di chiave del punto sopra.
  const ids = candidati.map((c) => c.id);
  if (ids.length > 0) {
    const { data } = await supabase
      .from("title_ratings")
      .select("title_id, media_type, zapp_score")
      .in("title_id", ids);
    for (const r of data ?? []) {
      punteggi.set(
        `${r.media_type}-${r.title_id}`,
        r.zapp_score === null ? null : Number(r.zapp_score),
      );
    }
    for (const c of candidati) {
      c.score = punteggi.get(`${c.mediaType}-${c.id}`) ?? null;
    }
  }

  // I classici per primi nell'elenco: `pickSeedGrid` li ordina comunque per fonte, ma
  // così la deduplicazione tiene la loro riga, che è quella meglio etichettata.
  for (const pagina of [classiciFilm, classiciSerie]) {
    for (const t of pagina?.results ?? []) {
      if (t.media_type !== "movie" && t.media_type !== "tv") continue;
      if (!t.poster_path) continue;
      const nome = "title" in t ? t.title : t.name;
      candidati.push({
        id: t.id,
        mediaType: t.media_type,
        title: nome ?? "",
        posterPath: t.poster_path,
        genreIds: Array.isArray(t.genre_ids) ? t.genre_ids : [],
        fonte: "classico",
        rank: null,
        score: typeof t.vote_average === "number" ? t.vote_average : null,
      });
    }
  }

  for (const t of trending?.results ?? []) {
    if (t.media_type !== "movie" && t.media_type !== "tv") continue;
    if (!t.poster_path) continue;
    const nome = "title" in t ? t.title : t.name;
    candidati.push({
      id: t.id,
      mediaType: t.media_type,
      title: nome ?? "",
      posterPath: t.poster_path,
      genreIds: Array.isArray(t.genre_ids) ? t.genre_ids : [],
      fonte: "tendenza",
      rank: null,
      // stessa scala dello ZappScore, che è 0-10 e non 0-100
      score: typeof t.vote_average === "number" ? t.vote_average : null,
    });
  }

  return pickSeedGrid(candidati);
});
