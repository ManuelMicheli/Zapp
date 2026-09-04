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

/** Card progresso della serie: "Sei a S2 E4", barra e "Segna progresso". */
export function SeriesProgress({
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

  return (
    <ProgressControls
      titleId={title.id}
      seasons={seasons}
      season={season}
      episode={episode}
      remaining={remaining}
      percent={percent}
      nextLabel={next ? `Prossimo: S${next.season} E${next.episode}` : "Ultimo episodio"}
    />
  );
}
