import "server-only";

import { cache } from "react";
import { PROVIDERS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { ratingKey, type TitleKey } from "@/lib/ratings/queries";

export interface ChartItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string | null;
  rank: number;
  momentum: number | null;
  providerId: number;
  /** `true` solo per il Top 10 ufficiale di Netflix; il resto è una stima. */
  official: boolean;
  score: number | null;
}

/** Le colonne del titolo che servono a una locandina: mai `raw`. */
const TITLE_COLUMNS = "id, media_type, title, poster_path, release_date";

interface ChartRow {
  rank: number;
  momentum: number | null;
  source: string;
  provider_id: number;
  media_type: "movie" | "tv";
  titles: {
    id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    release_date: string | null;
  } | null;
}

function toItems(rows: ChartRow[], scores: Map<string, number | null>): ChartItem[] {
  const seen = new Set<string>();
  const out: ChartItem[] = [];
  for (const row of rows) {
    const t = row.titles;
    if (!t || !t.poster_path) continue;
    const key = ratingKey(t.id, t.media_type);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      year: t.release_date ? t.release_date.slice(0, 4) : null,
      rank: row.rank,
      momentum: row.momentum,
      providerId: row.provider_id,
      official: row.source === "netflix_tudum",
      score: scores.get(key) ?? null,
    });
  }
  return out;
}

async function withScores(rows: ChartRow[]): Promise<ChartItem[]> {
  const supabase = await createClient();
  const ids = rows.map((r) => r.titles?.id).filter((id): id is number => id != null);
  const scores = new Map<string, number | null>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("title_ratings")
      .select("title_id, media_type, zapp_score")
      .in("title_id", ids);
    if (error) {
      // Un errore qui darebbe uno scaffale vuoto identico a "nessun dato": senza log
      // non si distinguerebbero, ed è il modo peggiore in cui questa pagina può rompersi
      console.error("[charts] punteggi degli scaffali non letti:", error.message);
    }
    for (const r of data ?? []) {
      scores.set(
        ratingKey(r.title_id, r.media_type),
        r.zapp_score === null ? null : Number(r.zapp_score),
      );
    }
  }
  return toItems(rows, scores);
}

/** L'ultima classifica disponibile di un provider, film e serie insieme. */
export const getProviderChart = cache(
  async (providerId: number): Promise<ChartItem[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("title_charts")
      .select(
        `rank, momentum, source, provider_id, media_type, titles!title_charts_title_fkey(${TITLE_COLUMNS})`,
      )
      .eq("provider_id", providerId)
      .eq("country", "IT")
      .not("title_id", "is", null)
      .order("period", { ascending: false })
      .order("rank", { ascending: true })
      .limit(40);
    if (error) {
      // Un errore qui darebbe uno scaffale vuoto identico a "nessun dato": senza log
      // non si distinguerebbero, ed è il modo peggiore in cui questa pagina può rompersi
      console.error("[charts] classifica del provider non letta:", error.message);
    }
    return withScores((data ?? []) as unknown as ChartRow[]);
  },
);

/** Chi ha guadagnato almeno due posizioni, su qualunque fonte. */
export const getRisingChart = cache(async (): Promise<ChartItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("title_charts")
    .select(
      `rank, momentum, source, provider_id, media_type, titles!title_charts_title_fkey(${TITLE_COLUMNS})`,
    )
    .eq("country", "IT")
    .gte("momentum", 2)
    .not("title_id", "is", null)
    .order("period", { ascending: false })
    .order("momentum", { ascending: false })
    .limit(40);
  if (error) {
    // Un errore qui darebbe uno scaffale vuoto identico a "nessun dato": senza log
    // non si distinguerebbero, ed è il modo peggiore in cui questa pagina può rompersi
    console.error("[charts] titoli in salita non letti:", error.message);
  }
  return withScores((data ?? []) as unknown as ChartRow[]);
});

/**
 * I meglio votati secondo lo ZappScore, solo dove il voto è solido.
 * La FK fra `title_ratings` e `titles` è composita (title_id, media_type): il nome
 * esplicito del vincolo evita che PostgREST non la deduca e risponda 400 in silenzio.
 */
export const getTopRatedOnZapp = cache(
  async (mediaType: "movie" | "tv"): Promise<ChartItem[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("title_ratings")
      .select(
        `zapp_score, title_id, media_type, titles!title_ratings_title_fkey!inner(${TITLE_COLUMNS})`,
      )
      .eq("media_type", mediaType)
      .eq("confidence", "high")
      .order("zapp_score", { ascending: false })
      .limit(20);
    if (error) {
      // Un errore qui darebbe uno scaffale vuoto identico a "nessun dato": senza log
      // non si distinguerebbero, ed è il modo peggiore in cui questa pagina può rompersi
      console.error("[charts] meglio votati non letti:", error.message);
    }

    const out: ChartItem[] = [];
    for (const row of data ?? []) {
      const t = row.titles as unknown as ChartRow["titles"];
      if (!t || !t.poster_path) continue;
      out.push({
        id: t.id,
        mediaType: t.media_type,
        title: t.title,
        posterPath: t.poster_path,
        year: t.release_date ? t.release_date.slice(0, 4) : null,
        rank: 0,
        momentum: null,
        providerId: 0,
        official: false,
        score: row.zapp_score === null ? null : Number(row.zapp_score),
      });
    }
    return out;
  },
);

/**
 * Il badge di una locandina: la posizione in classifica se c'è, altrimenti "in salita".
 * Una query sola per pagina, come per i voti.
 */
export const getChartBadges = cache(
  async (
    keys: TitleKey[],
  ): Promise<Map<string, { rank: number; providerName: string; rising: boolean }>> => {
    const out = new Map<
      string,
      { rank: number; providerName: string; rising: boolean }
    >();
    if (keys.length === 0) return out;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("title_charts")
      .select("title_id, media_type, rank, momentum, provider_id, period")
      .in(
        "title_id",
        keys.map((k) => k.id),
      )
      .eq("country", "IT")
      .order("period", { ascending: false })
      .order("rank", { ascending: true })
      .limit(200);
    if (error) {
      // Un errore qui darebbe uno scaffale vuoto identico a "nessun dato": senza log
      // non si distinguerebbero, ed è il modo peggiore in cui questa pagina può rompersi
      console.error("[charts] badge di classifica non letti:", error.message);
    }

    for (const row of data ?? []) {
      if (row.title_id === null) continue;
      const key = ratingKey(row.title_id, row.media_type);
      if (out.has(key)) continue; // la prima riga è già la più recente e meglio piazzata
      out.set(key, {
        rank: row.rank,
        providerName: PROVIDERS[row.provider_id]?.name ?? "streaming",
        rising: (row.momentum ?? 0) >= 2,
      });
    }
    return out;
  },
);
