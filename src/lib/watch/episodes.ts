// Calcoli sul progresso serie a partire da titles.raw.seasons.
// Esclude la stagione 0 (speciali) e le stagioni non ancora uscite.
// Nota: TMDB non espone l'air_date dei singoli episodi in raw.seasons,
// quindi l'esclusione degli episodi futuri è approssimata a livello di stagione.

export interface SeasonInfo {
  season: number;
  episodes: number;
}

interface RawSeason {
  season_number?: number;
  episode_count?: number;
  air_date?: string | null;
}

export function availableSeasons(raw: unknown): SeasonInfo[] {
  const seasons = (raw as { seasons?: RawSeason[] } | null)?.seasons;
  if (!Array.isArray(seasons)) return [];
  const today = new Date().toISOString().slice(0, 10);
  return seasons
    .filter(
      (s) =>
        (s.season_number ?? 0) > 0 &&
        (s.episode_count ?? 0) > 0 &&
        s.air_date != null &&
        s.air_date <= today,
    )
    .map((s) => ({ season: s.season_number!, episodes: s.episode_count! }))
    .sort((a, b) => a.season - b.season);
}

export function totalEpisodes(seasons: SeasonInfo[]): number {
  return seasons.reduce((sum, s) => sum + s.episodes, 0);
}

/** Episodi visti se si è arrivati a (season, episode). */
export function episodesWatched(
  seasons: SeasonInfo[],
  season: number,
  episode: number,
): number {
  let count = 0;
  for (const s of seasons) {
    if (s.season < season) count += s.episodes;
    else if (s.season === season) count += Math.min(episode, s.episodes);
  }
  return count;
}

export function remainingEpisodes(
  seasons: SeasonInfo[],
  season: number,
  episode: number,
): number {
  return Math.max(0, totalEpisodes(seasons) - episodesWatched(seasons, season, episode));
}

/** Episodio successivo, o null se (season, episode) è l'ultimo disponibile. */
export function nextEpisode(
  seasons: SeasonInfo[],
  season: number,
  episode: number,
): { season: number; episode: number } | null {
  const current = seasons.find((s) => s.season === season);
  if (current && episode < current.episodes) {
    return { season, episode: episode + 1 };
  }
  const later = seasons.filter((s) => s.season > season);
  if (later.length > 0) {
    return { season: later[0].season, episode: 1 };
  }
  return null;
}

export function isLastEpisode(
  seasons: SeasonInfo[],
  season: number,
  episode: number,
): boolean {
  if (seasons.length === 0) return false;
  return nextEpisode(seasons, season, episode) === null;
}
