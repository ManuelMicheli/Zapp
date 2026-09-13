import type { TmdbSeasonDetails } from "@/lib/tmdb/types";
import type { Tables } from "@/types/database";
import type { SeasonDetail } from "./dto";

type EntryRow = Pick<
  Tables<"watch_entries">,
  | "status"
  | "rating"
  | "season_number"
  | "episode_number"
  | "position_ms"
  | "position_season"
  | "position_episode"
>;

/**
 * Stessa regola della pagina stagione: `season_number`/`episode_number` sono
 * "l'ultimo episodio finito", `position_*` e' "dove sei adesso" (mai confonderli:
 * `docs/architecture/zconnection.md`).
 */
export function toSeasonDetail(
  season: TmdbSeasonDetails,
  entry: EntryRow | null,
): SeasonDetail {
  const n = season.season_number;
  const vistoFino = (() => {
    if (!entry || entry.season_number == null) return 0;
    if (entry.season_number > n) return Number.MAX_SAFE_INTEGER;
    if (entry.season_number === n) return entry.episode_number ?? 0;
    return 0;
  })();
  const inCorso =
    entry?.position_ms != null && entry.position_season === n
      ? entry.position_episode
      : null;

  return {
    number: n,
    name: season.name ?? `Stagione ${n}`,
    overview: season.overview || null,
    episodes: (season.episodes ?? []).map((e) => ({
      number: e.episode_number,
      name: e.name ?? `Episodio ${e.episode_number}`,
      overview: e.overview || null,
      stillPath: e.still_path ?? null,
      airDate: e.air_date ?? null,
      runtimeMin: typeof e.runtime === "number" ? e.runtime : null,
      watched: e.episode_number <= vistoFino,
      resumeMs: inCorso === e.episode_number ? (entry?.position_ms ?? null) : null,
    })),
  };
}
