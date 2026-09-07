import { TMDB_IMAGE_BASE, backdropUrl } from "@/lib/config";
import { getSeason } from "@/lib/tmdb/client";
import type { EntrySnapshot } from "@/lib/watch/actions";
import type { Tables } from "@/types/database";
import {
  availableSeasons,
  episodesWatched,
  nextEpisode,
  remainingEpisodes,
  totalEpisodes,
} from "@/lib/watch/episodes";
import { ProgressControls } from "./ProgressControls";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/**
 * "Riprendi": il fotogramma dell'episodio da vedere, con titolo, durata e barra di
 * avanzamento; sotto restano le stagioni (`SeasonList`), invariate (scelta utente
 * 2026-09-07, mockup "Serie B"). Una sola `getSeason` — throttle e memo del client
 * TMDB, cache Next 1 h — come nella fila "Continua a guardare" della home.
 */
export async function SeriesProgress({
  title,
  entry,
}: {
  title: Tables<"titles">;
  entry: EntrySnapshot | null;
}) {
  if (!entry || entry.status !== "watching") return null;

  const seasons = availableSeasons(title.raw);
  if (seasons.length === 0) return null;

  const season = entry.season_number ?? seasons[0].season;
  const episode = entry.episode_number ?? 0;
  const remaining = remainingEpisodes(seasons, season, episode);
  const total = totalEpisodes(seasons);
  const percent =
    total > 0 ? Math.round((episodesWatched(seasons, season, episode) / total) * 100) : 0;
  const next = nextEpisode(seasons, season, episode);

  // episodio mostrato: il prossimo da vedere, o il primo se non si è ancora iniziato
  const target = next ?? { season, episode: Math.max(1, episode) };
  const details = await getSeason(title.id, target.season).catch(() => null);
  const ep = details?.episodes.find((e) => e.episode_number === target.episode);

  return (
    <ProgressControls
      titleId={title.id}
      seasons={seasons}
      season={season}
      episode={episode}
      remaining={remaining}
      percent={percent}
      target={target}
      isLast={next === null && episode > 0}
      imageUrl={
        ep?.still_path
          ? `${TMDB_IMAGE_BASE}/original${ep.still_path}`
          : backdropUrl(title.backdrop_path, "original")
      }
      episodeName={ep?.name ?? null}
      runtimeLabel={ep?.runtime ? formatRuntime(ep.runtime) : null}
    />
  );
}
