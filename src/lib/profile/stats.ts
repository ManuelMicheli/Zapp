/** Statistiche di un profilo: il JSON dell'RPC `profile_stats` in forma tipata. */
export interface ProfileStats {
  filmsWatched: number;
  seriesWatched: number;
  watchedTotal: number;
  episodesSeen: number;
  minutes: number;
  topGenres: { name: string; count: number }[];
}

/** Legge il JSON di `profile_stats`; qualunque forma inattesa → zeri, mai errore. */
export function parseStats(json: unknown): ProfileStats {
  const o = (json ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  const genres = Array.isArray(o.top_genres) ? (o.top_genres as unknown[]) : [];
  return {
    filmsWatched: n("films_watched"),
    seriesWatched: n("series_watched"),
    watchedTotal: n("watched_total"),
    episodesSeen: n("episodes_seen"),
    minutes: n("minutes"),
    topGenres: genres
      .map((g) => g as { name?: unknown; count?: unknown })
      .filter((g) => typeof g.name === "string" && typeof g.count === "number")
      .map((g) => ({ name: g.name as string, count: g.count as number })),
  };
}
